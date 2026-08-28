#pragma once

#include <cstdint>
#include <memory>
#include <string>

namespace Analysis {

struct DecodedImage {
  uint8_t *bgraPixels{nullptr};
  int width{0};
  int height{0};
  int stride{0};
  bool success{false};
  std::string error;
  
  // For memory management - platform adapter owns this
  std::shared_ptr<void> platformHandle;
};

// Abstract interface for platform-specific image decoding and EXIF reading
class PlatformDecoder {
public:
  virtual ~PlatformDecoder() = default;

  // Decode image URI to BGRA pixels (max 4096 pixels on longest edge)
  // Returns a DecodedImage with pixels pointer valid until next call or destruction
  // Platform adapter is responsible for memory management via platformHandle
  virtual DecodedImage DecodeImageToBgra(const std::string &uri, int maxPixelSize = 4096) = 0;

  // Read capture timestamp from image EXIF data
  // Returns milliseconds since Unix epoch, or 0 if not available
  virtual int64_t ReadCapturedAtMillis(const std::string &uri) = 0;

  // Get the database path for this platform
  virtual std::string GetDatabasePath() const = 0;
};

} // namespace Analysis
