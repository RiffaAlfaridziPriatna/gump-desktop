package com.gumpdesktop

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Rect
import android.media.ExifInterface
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
import com.google.mlkit.vision.face.FaceContour
import com.google.mlkit.vision.face.FaceDetection
import com.google.mlkit.vision.face.FaceDetectorOptions
import com.google.mlkit.vision.face.FaceLandmark
import java.io.File
import java.io.RandomAccessFile
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Locale
import java.util.TimeZone
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

  private data class NormalizedFaceBox(
      val left: Float,
      val top: Float,
      val width: Float,
      val height: Float,
  )

  private data class FaceDetectionResult(
      val box: NormalizedFaceBox,
      val map: WritableMap,
  )

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
            loadOrientedBitmap(path)
                ?: run {
                  promise.reject("EIMAGE", "Unable to decode image")
                  return@execute
                }

        val detector = createFaceDetector()
        val imageWidth = bitmap.width.toFloat()
        val imageHeight = bitmap.height.toFloat()
        val detections = collectFaceDetections(detector, bitmap, imageWidth, imageHeight)

        val result = Arguments.createArray()
        detections.forEachIndexed { index, detection ->
          detection.map.putString("faceId", "local-face-$index")
          result.pushMap(detection.map)
        }
        bitmap.recycle()
        promise.resolve(result)
      } catch (error: Exception) {
        promise.reject("EDETECT", error.message ?: "Face detection failed", error)
      }
    }
  }

  @ReactMethod
  fun readImageCaptureTime(uri: String, promise: Promise) {
    executor.execute {
      try {
        val path = pathFromUri(uri)
        val file = File(path)
        if (!file.exists()) {
          promise.resolve(null)
          return@execute
        }

        val exif = ExifInterface(path)
        val dateString =
            exif.getAttribute(ExifInterface.TAG_DATETIME_ORIGINAL)
                ?: exif.getAttribute(ExifInterface.TAG_DATETIME_DIGITIZED)
                ?: exif.getAttribute(ExifInterface.TAG_DATETIME)
        if (dateString.isNullOrBlank()) {
          promise.resolve(null)
          return@execute
        }

        val formatter = SimpleDateFormat("yyyy:MM:dd HH:mm:ss", Locale.US)
        formatter.timeZone = TimeZone.getDefault()
        val date = formatter.parse(dateString)
        if (date == null) {
          promise.resolve(null)
          return@execute
        }

        promise.resolve(date.time.toDouble())
      } catch (_: Exception) {
        promise.resolve(null)
      }
    }
  }

  @ReactMethod
  fun computePerceptualHash(uri: String, promise: Promise) {
    executor.execute {
      try {
        val path = pathFromUri(uri)
        val file = File(path)
        if (!file.exists()) {
          promise.resolve(null)
          return@execute
        }

        val hash = computeDifferenceHash(path)
        promise.resolve(hash)
      } catch (_: Exception) {
        promise.resolve(null)
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

        var width = options.outWidth
        var height = options.outHeight
        val exif = ExifInterface(path)
        val orientation =
            exif.getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL,
            )
        if (orientation == ExifInterface.ORIENTATION_ROTATE_90 ||
            orientation == ExifInterface.ORIENTATION_ROTATE_270 ||
            orientation == ExifInterface.ORIENTATION_TRANSPOSE ||
            orientation == ExifInterface.ORIENTATION_TRANSVERSE) {
          val tmp = width
          width = height
          height = tmp
        }

        promise.resolve(
            Arguments.createMap().apply {
              putInt("width", width)
              putInt("height", height)
            },
        )
      } catch (error: Exception) {
        promise.reject("EUNKNOWN", error.message, error)
      }
    }
  }

  private fun cullingAlbumDirectory(albumId: String): File =
      File(reactContext.filesDir, "Gump/culling-albums/$albumId")

  private fun createFaceDetector() =
      FaceDetection.getClient(
          FaceDetectorOptions.Builder()
              .setPerformanceMode(FaceDetectorOptions.PERFORMANCE_MODE_ACCURATE)
              .setLandmarkMode(FaceDetectorOptions.LANDMARK_MODE_ALL)
              .setClassificationMode(FaceDetectorOptions.CLASSIFICATION_MODE_ALL)
              .setMinFaceSize(0.03f)
              .build(),
      )

  private fun collectFaceDetections(
      detector: com.google.mlkit.vision.face.FaceDetector,
      bitmap: Bitmap,
      imageWidth: Float,
      imageHeight: Float,
  ): List<FaceDetectionResult> {
    val fullFrame = detectFacesInBitmap(detector, bitmap, imageWidth, imageHeight, 0, 0)
    val pixelCount = imageWidth * imageHeight
    if (fullFrame.size >= MIN_FACES_TO_SKIP_TILING || pixelCount < MIN_PIXELS_FOR_TILING) {
      return deduplicateFaceDetections(fullFrame)
    }

    val combined = fullFrame.toMutableList()
    combined.addAll(detectTiledFaces(detector, bitmap, imageWidth, imageHeight, gridCount = 2))
    val deduped = deduplicateFaceDetections(combined)
    if (deduped.size >= MIN_FACES_TO_SKIP_TILING) {
      return deduped
    }

    combined.addAll(detectTiledFaces(detector, bitmap, imageWidth, imageHeight, gridCount = 3))
    return deduplicateFaceDetections(combined)
  }

  private fun detectFacesInBitmap(
      detector: com.google.mlkit.vision.face.FaceDetector,
      bitmap: Bitmap,
      imageWidth: Float,
      imageHeight: Float,
      offsetX: Int,
      offsetY: Int,
  ): List<FaceDetectionResult> {
    val faces = Tasks.await(detector.process(InputImage.fromBitmap(bitmap, 0)))
    return faces.mapNotNull { face ->
      if (!isAcceptableFace(face, imageWidth, imageHeight)) {
        return@mapNotNull null
      }
      val map = faceToMap(face, 0, bitmap, imageWidth, imageHeight, offsetX, offsetY)
      FaceDetectionResult(box = normalizedBoxFromMap(map), map = map)
    }
  }

  private fun detectTiledFaces(
      detector: com.google.mlkit.vision.face.FaceDetector,
      bitmap: Bitmap,
      imageWidth: Float,
      imageHeight: Float,
      gridCount: Int,
  ): List<FaceDetectionResult> {
    val imageWidthInt = bitmap.width
    val imageHeightInt = bitmap.height
    val tileWidth =
        (imageWidthInt / gridCount.toFloat() * (1f + TILE_OVERLAP_FRACTION)).toInt()
            .coerceAtMost(imageWidthInt)
    val tileHeight =
        (imageHeightInt / gridCount.toFloat() * (1f + TILE_OVERLAP_FRACTION)).toInt()
            .coerceAtMost(imageHeightInt)
    val stepX = imageWidthInt / gridCount
    val stepY = imageHeightInt / gridCount

    val detections = mutableListOf<FaceDetectionResult>()
    for (row in 0 until gridCount) {
      for (col in 0 until gridCount) {
        var originX = col * stepX
        var originY = row * stepY
        if (originX + tileWidth > imageWidthInt) {
          originX = max(0, imageWidthInt - tileWidth)
        }
        if (originY + tileHeight > imageHeightInt) {
          originY = max(0, imageHeightInt - tileHeight)
        }

        val tileBitmap =
            Bitmap.createBitmap(bitmap, originX, originY, tileWidth, tileHeight)
        try {
          detections.addAll(
              detectFacesInBitmap(
                  detector,
                  tileBitmap,
                  imageWidth,
                  imageHeight,
                  originX,
                  originY,
              ),
          )
        } finally {
          if (tileBitmap !== bitmap) {
            tileBitmap.recycle()
          }
        }
      }
    }
    return detections
  }

  private fun normalizedBoxFromMap(map: WritableMap): NormalizedFaceBox {
    val box = map.getMap("boundingBox")!!
    return NormalizedFaceBox(
        left = box.getDouble("left").toFloat(),
        top = box.getDouble("top").toFloat(),
        width = box.getDouble("width").toFloat(),
        height = box.getDouble("height").toFloat(),
    )
  }

  private fun intersectionOverUnion(a: NormalizedFaceBox, b: NormalizedFaceBox): Float {
    val intersectLeft = max(a.left, b.left)
    val intersectTop = max(a.top, b.top)
    val intersectRight = min(a.left + a.width, b.left + b.width)
    val intersectBottom = min(a.top + a.height, b.top + b.height)
    val intersectWidth = max(0f, intersectRight - intersectLeft)
    val intersectHeight = max(0f, intersectBottom - intersectTop)
    val intersection = intersectWidth * intersectHeight
    if (intersection <= 0f) {
      return 0f
    }
    val union = a.width * a.height + b.width * b.height - intersection
    if (union <= 0f) {
      return 0f
    }
    return intersection / union
  }

  private fun deduplicateFaceDetections(
      detections: List<FaceDetectionResult>,
  ): List<FaceDetectionResult> {
    if (detections.size <= 1) {
      return detections
    }

    val kept = mutableListOf<FaceDetectionResult>()
    for (candidate in detections) {
      val overlaps =
          kept.any {
            intersectionOverUnion(candidate.box, it.box) >= FACE_BOX_IOU_THRESHOLD
          }
      if (!overlaps) {
        kept.add(candidate)
      }
    }
    return kept
  }

  private fun loadOrientedBitmap(path: String): Bitmap? {
    val raw = BitmapFactory.decodeFile(path) ?: return null
    val exif = ExifInterface(path)
    val orientation =
        exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
    if (orientation == ExifInterface.ORIENTATION_NORMAL) {
      return raw
    }

    val matrix = Matrix()
    when (orientation) {
      ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
      ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
      ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
      ExifInterface.ORIENTATION_FLIP_HORIZONTAL -> matrix.postScale(-1f, 1f)
      ExifInterface.ORIENTATION_FLIP_VERTICAL -> matrix.postScale(1f, -1f)
      ExifInterface.ORIENTATION_TRANSPOSE -> {
        matrix.postRotate(90f)
        matrix.postScale(-1f, 1f)
      }
      ExifInterface.ORIENTATION_TRANSVERSE -> {
        matrix.postRotate(270f)
        matrix.postScale(-1f, 1f)
      }
      else -> return raw
    }

    val oriented = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, matrix, true)
    if (oriented !== raw) {
      raw.recycle()
    }
    return oriented
  }

  private fun passesBaseFaceBoxChecks(
      face: Face,
      imageWidth: Float,
      imageHeight: Float,
      minAspect: Float,
  ): Boolean {
    val box = face.boundingBox
    if (box.width() < 30 || box.height() < 30) {
      return false
    }

    val faceAreaFraction =
        (box.width().toFloat() * box.height().toFloat()) / (imageWidth * imageHeight)
    if (faceAreaFraction < 0.0003f) {
      return false
    }

    val aspect = box.width().toFloat() / max(box.height(), 1)
    if (aspect < minAspect || aspect > 1.8f) {
      return false
    }

    return true
  }

  private fun isAcceptableFrontalFace(
      face: Face,
      imageWidth: Float,
      imageHeight: Float,
  ): Boolean {
    if (!passesBaseFaceBoxChecks(face, imageWidth, imageHeight, minAspect = 0.55f)) {
      return false
    }

    if (face.getLandmark(FaceLandmark.LEFT_EYEBROW) == null ||
        face.getLandmark(FaceLandmark.RIGHT_EYEBROW) == null) {
      return false
    }

    val contour = face.getContour(FaceContour.FACE)
    if (contour == null || contour.points.size < 8) {
      return false
    }

    val leftEye = face.getLandmark(FaceLandmark.LEFT_EYE)?.position ?: return false
    val rightEye = face.getLandmark(FaceLandmark.RIGHT_EYE)?.position ?: return false
    val nose = face.getLandmark(FaceLandmark.NOSE_BASE)?.position ?: return false
    val mouthLeft = face.getLandmark(FaceLandmark.MOUTH_LEFT)?.position
    val mouthRight = face.getLandmark(FaceLandmark.MOUTH_RIGHT)?.position
    val mouthBottom =
        face.getLandmark(FaceLandmark.MOUTH_BOTTOM)?.position
            ?: mouthLeft
            ?: return false

    if (leftEye.x >= rightEye.x) {
      return false
    }

    val box = face.boundingBox
    val eyeDistance = rightEye.x - leftEye.x
    if (eyeDistance < box.width() * 0.15f || eyeDistance > box.width() * 0.65f) {
      return false
    }

    if (kotlin.math.abs(leftEye.y - rightEye.y) / box.height().toFloat() > 0.12f) {
      return false
    }

    val eyeCenterX = (leftEye.x + rightEye.x) / 2f
    if (kotlin.math.abs(nose.x - eyeCenterX) > eyeDistance * 0.45f) {
      return false
    }

    val eyesY = (leftEye.y + rightEye.y) / 2f
    if (eyesY >= nose.y || nose.y >= mouthBottom.y) {
      return false
    }

    val relEyesY = (eyesY - box.top) / box.height().toFloat()
    val relNoseY = (nose.y - box.top) / box.height().toFloat()
    val relMouthY = (mouthBottom.y - box.top) / box.height().toFloat()
    if (relEyesY > 0.52f || relMouthY < 0.48f) {
      return false
    }

    val eyeToNose = relNoseY - relEyesY
    val noseToMouth = relMouthY - relNoseY
    if (eyeToNose < 0.12f || eyeToNose > 0.45f) {
      return false
    }
    if (noseToMouth < 0.08f || noseToMouth > 0.35f) {
      return false
    }

    if (mouthLeft != null && mouthRight != null) {
      val mouthWidth = mouthRight.x - mouthLeft.x
      if (mouthWidth < eyeDistance * 0.55f) {
        return false
      }
    }

    return true
  }

  private fun isAcceptableProfileFace(
      face: Face,
      imageWidth: Float,
      imageHeight: Float,
  ): Boolean {
    if (!passesBaseFaceBoxChecks(face, imageWidth, imageHeight, minAspect = 0.35f)) {
      return false
    }

    val contour = face.getContour(FaceContour.FACE)
    if (contour == null || contour.points.size < 6) {
      return false
    }

    val leftEye = face.getLandmark(FaceLandmark.LEFT_EYE)?.position
    val rightEye = face.getLandmark(FaceLandmark.RIGHT_EYE)?.position
    if (leftEye == null && rightEye == null) {
      return false
    }

    val nose = face.getLandmark(FaceLandmark.NOSE_BASE)?.position ?: return false
    val mouthBottom =
        face.getLandmark(FaceLandmark.MOUTH_BOTTOM)?.position
            ?: face.getLandmark(FaceLandmark.MOUTH_LEFT)?.position
            ?: return false

    val eyesY =
        when {
          leftEye != null && rightEye != null -> (leftEye.y + rightEye.y) / 2f
          leftEye != null -> leftEye.y
          else -> rightEye!!.y
        }

    if (eyesY >= nose.y || nose.y >= mouthBottom.y) {
      return false
    }

    return true
  }

  private fun isAcceptableFace(
      face: Face,
      imageWidth: Float,
      imageHeight: Float,
  ): Boolean {
    if (isAcceptableFrontalFace(face, imageWidth, imageHeight)) {
      return true
    }
    return isAcceptableProfileFace(face, imageWidth, imageHeight)
  }

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
      offsetX: Int = 0,
      offsetY: Int = 0,
  ): WritableMap {
    val box = face.boundingBox
    val mappedBox =
        Rect(
            box.left + offsetX,
            box.top + offsetY,
            box.right + offsetX,
            box.bottom + offsetY,
        )
    val sharpness = computeSharpness(bitmap, box)

    return Arguments.createMap().apply {
      putMap(
          "boundingBox",
          Arguments.createMap().apply {
            putDouble("left", mappedBox.left / imageWidth.toDouble())
            putDouble("top", mappedBox.top / imageHeight.toDouble())
            putDouble("width", mappedBox.width() / imageWidth.toDouble())
            putDouble("height", mappedBox.height() / imageHeight.toDouble())
          },
      )
      putMap("eyesOpen", eyesOpenFromFace(face))
      putDouble("sharpness", sharpness.toDouble())
      putDouble("brightness", 60.0)
      putArray(
          "landmarks",
          landmarksFromFace(face, imageWidth, imageHeight, offsetX, offsetY),
      )
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
      offsetX: Int = 0,
      offsetY: Int = 0,
  ) =
      Arguments.createArray().apply {
        pushLandmark(face, FaceLandmark.LEFT_EYE, "eyeLeft", imageWidth, imageHeight, offsetX, offsetY)
        pushLandmark(face, FaceLandmark.RIGHT_EYE, "eyeRight", imageWidth, imageHeight, offsetX, offsetY)
        pushLandmark(face, FaceLandmark.NOSE_BASE, "nose", imageWidth, imageHeight, offsetX, offsetY)
        pushLandmark(face, FaceLandmark.MOUTH_BOTTOM, "mouth", imageWidth, imageHeight, offsetX, offsetY)
      }

  private fun com.facebook.react.bridge.WritableArray.pushLandmark(
      face: Face,
      landmarkType: Int,
      type: String,
      imageWidth: Float,
      imageHeight: Float,
      offsetX: Int,
      offsetY: Int,
  ) {
    val position = face.getLandmark(landmarkType)?.position ?: return
    pushMap(
        Arguments.createMap().apply {
          putString("type", type)
          putDouble("x", ((position.x + offsetX) / imageWidth).toDouble())
          putDouble("y", (1.0 - (position.y + offsetY) / imageHeight).toDouble())
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

    val probs = listOfNotNull(left, right)
    val minOpenProbability = probs.min()
    val maxOpenProbability = probs.max()
    val avgOpenProbability = probs.average().toFloat()
    val openThreshold = 0.65f
    val openMinThreshold = 0.55f
    val closedMaxThreshold = 0.40f
    val closedAvgThreshold = 0.35f

    return when {
      avgOpenProbability >= openThreshold && minOpenProbability >= openMinThreshold -> {
        Arguments.createMap().apply {
          putBoolean("value", true)
          putDouble(
              "confidence",
              min(98.0, 86.0 + (avgOpenProbability - openThreshold) * 200.0).toDouble(),
          )
        }
      }
      maxOpenProbability <= closedMaxThreshold ||
          avgOpenProbability <= closedAvgThreshold -> {
        Arguments.createMap().apply {
          putBoolean("value", false)
          putDouble(
              "confidence",
              min(98.0, 86.0 + (closedMaxThreshold - maxOpenProbability) * 400.0).toDouble(),
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

  private fun computeDifferenceHash(path: String): String? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeFile(path, bounds)
    val sampleOptions =
        BitmapFactory.Options().apply {
          inSampleSize =
              max(1, min(bounds.outWidth, bounds.outHeight) / 256)
          inJustDecodeBounds = false
        }
    val bitmap = BitmapFactory.decodeFile(path, sampleOptions) ?: return null
    val scaled = Bitmap.createScaledBitmap(bitmap, 9, 8, true)
    if (scaled !== bitmap) {
      bitmap.recycle()
    }

    val pixels = IntArray(72)
    scaled.getPixels(pixels, 0, 9, 0, 0, 9, 8)
    scaled.recycle()

    val gray = IntArray(72) { index ->
      val pixel = pixels[index]
      (Color.red(pixel) * 0.299 + Color.green(pixel) * 0.587 + Color.blue(pixel) * 0.114)
          .toInt()
    }

    var hash = 0L
    var bit = 0
    for (y in 0 until 8) {
      for (x in 0 until 8) {
        if (gray[y * 9 + x] > gray[y * 9 + x + 1]) {
          hash = hash or (1L shl (63 - bit))
        }
        bit++
      }
    }
    return String.format(Locale.US, "%016x", hash)
  }

  companion object {
    private const val FACE_BOX_IOU_THRESHOLD = 0.50f
    private const val TILE_OVERLAP_FRACTION = 0.25f
    private const val MIN_FACES_TO_SKIP_TILING = 8
    private const val MIN_PIXELS_FOR_TILING = 2_000_000
  }
}
