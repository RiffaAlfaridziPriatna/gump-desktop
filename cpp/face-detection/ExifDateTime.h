#pragma once

#include <cstdint>
#include <optional>
#include <string>

namespace FaceDetection {

/// Parse EXIF DateTime / DateTimeOriginal strings ("yyyy:MM:dd HH:mm:ss") as UTC.
/// Both desktop platforms must use this so capturedAt does not drift by timezone.
std::optional<int64_t> parseExifDateTimeToUnixMillisUtc(const std::string &dateTime);

} // namespace FaceDetection
