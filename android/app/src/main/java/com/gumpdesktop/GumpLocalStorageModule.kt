package com.gumpdesktop

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Rect
import android.net.Uri
import android.util.Base64
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.face.Face
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.face.FaceLandmark
import java.io.File
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.util.UUID
import java.util.concurrent.Executors
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min

class GumpLocalStorageModule(
    private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {

  private val executor = Executors.newSingleThreadExecutor()

  override fun getName(): String = "GumpLocalStorage"

  @ReactMethod
  fun detectFacesForCulling(uri: String, promise: Promise) {
    executor.execute {
      try {
        val path = pathFromUri(uri)
        val file = File(path)
        if (!file.exists()) {
          promise.reject("ENOENT", "Photo file not found")
          return@execute
        }

        val bitmap =
            BitmapFactory.decodeFile(path)
                ?: run {
                  promise.reject("EIMAGE", "Unable to decode image")
                  return@execute
                }

        val image = InputImage.fromFilePath(reactContext, Uri.fromFile(file))
        val options =
            FaceDetectorOptions.Builder()
                .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
                .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
                .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
                .build()
        val detector = FaceDetection.getClient(options)
        val faces = Tasks.await(detector.process(image))

        val imageWidth = bitmap.width.toFloat()
        val imageHeight = bitmap.height.toFloat()
        val result = Arguments.createArray()
        faces.forEachIndexed { index, face ->
          result.pushMap(faceToMap(face, index, bitmap, imageWidth, imageHeight))
        }
        bitmap.recycle()
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("EDETECT", error.message ?: "Face detection failed", error)
      }
    }
  }

  @ReactMethod
  fun copyPhoto(
      albumId: String,
      sourceUri: String,
      fileName: String?,
      photoId: String?,
      promise: Promise,
  ) {
    executor.execute {
      try {
        val sourcePath = pathFromUri(sourceUri)
        val sourceFile = File(sourcePath)
        if (!sourceFile.exists()) {
          promise.reject("ENOENT", "Source file not found")
          return@execute
        }

        val albumDir = cullingAlbumDirectory(albumId)
        albumDir.mkdirs()

        val safeName = fileName ?: "photo.jpg"
        val ext = safeName.substringAfterLast('.', "")
        val destId = photoId?.takeIf { it.isNotEmpty() } ?: UUID.randomUUID().toString()
        val destName = if (ext.isNotEmpty()) "$destId.$ext" else destId
        val destFile = File(albumDir, destName)
        sourceFile.copyTo(destFile, overwrite = false)

        val mimeExt = destFile.extension.lowercase()
        val type = if (mimeExt.isNotEmpty()) "public.$mimeExt" else "image/jpeg"
        promise.resolve(
            Arguments.createMap().apply {
              putString("uri", "file://${destFile.absolutePath}")
              putString("name", destName)
              putDouble("size", destFile.length().toDouble())
              putString("type", type)
            },
        )
      } catch (error: Exception) {
        promise.reject("ECOPY", error.message ?: "Copy failed", error)
      }
    }
  }

  @ReactMethod
  fun listPhotos(albumId: String, promise: Promise) {
    executor.execute {
      try {
        val albumDir = cullingAlbumDirectory(albumId)
        if (!albumDir.exists()) {
          promise.resolve(Arguments.createArray())
          return@execute
        }

        val files = Arguments.createArray()
        albumDir
            .listFiles()
            ?.filter { it.isFile && !it.name.startsWith(".") }
            ?.forEach { file ->
              val ext = file.extension.lowercase()
              val type = if (ext.isNotEmpty()) "public.$ext" else "image/jpeg"
              files.pushMap(
                  Arguments.createMap().apply {
                    putString("uri", "file://${file.absolutePath}")
                    putString("name", file.name)
                    putDouble("size", file.length().toDouble())
                    putString("type", type)
                  },
              )
            }
        promise.resolve(files)
      } catch (error: Exception) {
        promise.reject("EREAD", error.message ?: "List failed", error)
      }
    }
  }

  @ReactMethod
  fun readFileSlice(uri: String, start: Double, end: Double, promise: Promise) {
    executor.execute {
      try {
        val path = pathFromUri(uri)
        val file = File(path)
        if (!file.exists()) {
          promise.reject("ENOENT", "File not found")
          return@execute
        }

        val startOffset = start.toLong()
        val endOffset = end.toLong()
        if (endOffset < startOffset) {
          promise.reject("EINVAL", "Invalid slice range")
          return@execute
        }

        val length = (endOffset - startOffset).toInt()
        RandomAccessFile(file, "r").use { handle ->
          handle.seek(startOffset)
          val buffer = ByteArray(length)
          val read = handle.read(buffer)
          if (read != length) {
            promise.reject("EREAD", "Unexpected end of file while reading slice")
            return@execute
          }
          promise.resolve(
              Arguments.createMap().apply {
                putString("data", Base64.encodeToString(buffer, Base64.NO_WRAP))
                putInt("size", length)
              },
          )
        }
      } catch (error: Exception) {
        promise.reject("EUNKNOWN", error.message, error)
      }
    }
  }

  @ReactMethod
  fun uploadFilePart(
      uri: String,
      start: Double,
      end: Double,
      uploadUrl: String,
      promise: Promise,
  ) {
    executor.execute {
      try {
        val path = pathFromUri(uri)
        val file = File(path)
        if (!file.exists()) {
          promise.reject("ENOENT", "File not found")
          return@execute
        }

        val startOffset = start.toLong()
        val endOffset = end.toLong()
        if (endOffset < startOffset) {
          promise.reject("EINVAL", "Invalid slice range")
          return@execute
        }

        val length = (endOffset - startOffset).toInt()
        val data =
            RandomAccessFile(file, "r").use { handle ->
              handle.seek(startOffset)
              val buffer = ByteArray(length)
              val read = handle.read(buffer)
              if (read != length) {
                promise.reject("EREAD", "Unexpected end of file while reading slice")
                return@execute
              }
              buffer
            }

        val connection = URL(uploadUrl).openConnection() as HttpURLConnection
        connection.requestMethod = "PUT"
        connection.doOutput = true
        connection.connectTimeout = 60_000
        connection.readTimeout = 60_000
        connection.outputStream.use { stream -> stream.write(data) }

        val status = connection.responseCode
        if (status !in 200..299) {
          promise.reject("EUPLOAD", "Upload part failed with HTTP $status")
          return@execute
        }

        val rawETag = connection.getHeaderField("ETag")
        if (rawETag.isNullOrEmpty()) {
          promise.reject("EUPLOAD", "Missing ETag header")
          return@execute
        }

        promise.resolve(
            Arguments.createMap().apply {
              putString("eTag", rawETag.replace("\"", ""))
            },
        )
      } catch (error: Exception) {
        promise.reject("EUNKNOWN", error.message, error)
      }
    }
  }

  @ReactMethod
  fun deletePhoto(uri: String, promise: Promise) {
    executor.execute {
      try {
        val path = pathFromUri(uri)
        if (path.isEmpty()) {
          promise.resolve(true)
          return@execute
        }
        val file = File(path)
        if (file.exists()) {
          file.delete()
        }
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("EDELETE", error.message, error)
      }
    }
  }

  @ReactMethod
  fun deleteAlbum(albumId: String, promise: Promise) {
    executor.execute {
      try {
        val albumDir = cullingAlbumDirectory(albumId)
        if (albumDir.exists()) {
          albumDir.deleteRecursively()
        }
        promise.resolve(true)
      } catch (error: Exception) {
        promise.reject("EDELETE", error.message, error)
      }
    }
  }

  @ReactMethod
  fun getImageDimensions(uri: String, promise: Promise) {
    executor.execute {
      try {
        val path = pathFromUri(uri)
        val file = File(path)
        if (!file.exists()) {
          promise.reject("ENOENT", "Photo file not found")
          return@execute
        }

        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(path, options)
        if (options.outWidth <= 0 || options.outHeight <= 0) {
          promise.reject("EIMAGE", "Invalid image dimensions")
          return@execute
        }

        promise.resolve(
            Arguments.createMap().apply {
              putInt("width", options.outWidth)
              putInt("height", options.outHeight)
            },
        )
      } catch (error: Exception) {
        promise.reject("EUNKNOWN", error.message, error)
      }
    }
  }

  private fun cullingAlbumDirectory(albumId: String): File =
      File(reactContext.filesDir, "Gump/culling-albums/$albumId")

  private fun pathFromUri(uri: String): String {
    if (uri.isEmpty()) {
      return ""
    }
    if (uri.startsWith("file://")) {
      return Uri.parse(uri).path ?: uri.removePrefix("file://")
    }
    return uri
  }

  private fun faceToMap(
      face: Face,
      index: Int,
      bitmap: Bitmap,
      imageWidth: Float,
      imageHeight: Float,
  ): WritableMap {
    val box = face.boundingBox
    val sharpness = computeSharpness(bitmap, box)

    return Arguments.createMap().apply {
      putMap(
          "boundingBox",
          Arguments.createMap().apply {
            putDouble("left", box.left / imageWidth.toDouble())
            putDouble("top", box.top / imageHeight.toDouble())
            putDouble("width", box.width() / imageWidth.toDouble())
            putDouble("height", box.height() / imageHeight.toDouble())
          },
      )
      putMap("eyesOpen", eyesOpenFromFace(face))
      putDouble("sharpness", sharpness.toDouble())
      putDouble("brightness", 60.0)
      putArray("landmarks", landmarksFromFace(face, imageWidth, imageHeight))
      putMap(
          "pose",
          Arguments.createMap().apply {
            putDouble("pitch", face.headEulerAngleX.toDouble())
            putDouble("roll", face.headEulerAngleZ.toDouble())
            putDouble("yaw", face.headEulerAngleY.toDouble())
          },
      )
      putString("faceId", "local-face-$index")
    }
  }

  private fun landmarksFromFace(
      face: Face,
      imageWidth: Float,
      imageHeight: Float,
  ) =
      Arguments.createArray().apply {
        pushLandmark(face, FaceLandmark.LEFT_EYE, "eyeLeft", imageWidth, imageHeight)
        pushLandmark(face, FaceLandmark.RIGHT_EYE, "eyeRight", imageWidth, imageHeight)
        pushLandmark(face, FaceLandmark.NOSE_BASE, "nose", imageWidth, imageHeight)
        pushLandmark(face, FaceLandmark.MOUTH_BOTTOM, "mouth", imageWidth, imageHeight)
      }

  private fun com.facebook.react.bridge.WritableArray.pushLandmark(
      face: Face,
      landmarkType: Int,
      type: String,
      imageWidth: Float,
      imageHeight: Float,
  ) {
    val position = face.getLandmark(landmarkType)?.position ?: return
    pushMap(
        Arguments.createMap().apply {
          putString("type", type)
          putDouble("x", (position.x / imageWidth).toDouble())
          putDouble("y", (1.0 - position.y / imageHeight).toDouble())
        },
    )
  }

  private fun eyesOpenFromFace(face: Face): WritableMap {
    val left = face.leftEyeOpenProbability
    val right = face.rightEyeOpenProbability

    if (left == null && right == null) {
      return Arguments.createMap().apply {
        putBoolean("value", false)
        putDouble("confidence", 50.0)
      }
    }

    val minOpenProbability = listOfNotNull(left, right).min()
    val openThreshold = 0.75f
    val closedThreshold = 0.35f

    return when {
      minOpenProbability >= openThreshold -> {
        Arguments.createMap().apply {
          putBoolean("value", true)
          putDouble(
              "confidence",
              min(98.0, 86.0 + (minOpenProbability - openThreshold) * 200.0).toDouble(),
          )
        }
      }
      minOpenProbability <= closedThreshold -> {
        Arguments.createMap().apply {
          putBoolean("value", false)
          putDouble(
              "confidence",
              min(98.0, 86.0 + (closedThreshold - minOpenProbability) * 400.0).toDouble(),
          )
        }
      }
      else -> {
        Arguments.createMap().apply {
          putBoolean("value", false)
          putDouble("confidence", 72.0)
        }
      }
    }
  }

  private fun computeSharpness(bitmap: Bitmap, box: Rect): Float {
    val left = box.left.coerceIn(0, bitmap.width - 1)
    val top = box.top.coerceIn(0, bitmap.height - 1)
    val width = box.width().coerceAtMost(bitmap.width - left)
    val height = box.height().coerceAtMost(bitmap.height - top)
    if (width < 3 || height < 3) {
      return 50f
    }

    val crop = Bitmap.createBitmap(bitmap, left, top, width, height)
    val maxSide = max(crop.width, crop.height).toFloat()
    val targetSide = 128f
    val scaled =
        if (maxSide > targetSide) {
          val scale = targetSide / maxSide
          Bitmap.createScaledBitmap(
              crop,
              max(1, (crop.width * scale).toInt()),
              max(1, (crop.height * scale).toInt()),
              true,
          ).also { crop.recycle() }
        } else {
          crop
        }

    val pixels = IntArray(scaled.width * scaled.height)
    scaled.getPixels(pixels, 0, scaled.width, 0, 0, scaled.width, scaled.height)
    scaled.recycle()

    val gray = DoubleArray(pixels.size)
    for (index in pixels.indices) {
      val pixel = pixels[index]
      gray[index] =
          Color.red(pixel) * 0.299 + Color.green(pixel) * 0.587 + Color.blue(pixel) * 0.114
    }

    val imageWidth = scaled.width
    val imageHeight = scaled.height
    var sum = 0.0
    var sumSquared = 0.0
    var count = 0

    for (y in 1 until imageHeight - 1) {
      for (x in 1 until imageWidth - 1) {
        val index = y * imageWidth + x
        val laplacian =
            -gray[index - imageWidth] -
                gray[index - 1] +
                4 * gray[index] -
                gray[index + 1] -
                gray[index + imageWidth]
        sum += laplacian
        sumSquared += laplacian * laplacian
        count++
      }
    }

    if (count == 0) {
      return 50f
    }

    val mean = sum / count
    val variance = (sumSquared / count) - mean * mean
    val normalized = (ln(variance + 1.0) / ln(1000.0) * 100.0).toFloat()
    return normalized.coerceIn(0f, 100f)
  }
}
