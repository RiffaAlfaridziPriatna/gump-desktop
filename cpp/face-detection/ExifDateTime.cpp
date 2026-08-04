#include "ExifDateTime.h"

#include <cstdio>
#include <ctime>

namespace FaceDetection {

std::optional<int64_t> parseExifDateTimeToUnixMillisUtc(const std::string &dateTime) {
  if (dateTime.size() < 19) {
    return std::nullopt;
  }

  int year = 0;
  int month = 0;
  int day = 0;
  int hour = 0;
  int minute = 0;
  int second = 0;
  if (std::sscanf(
          dateTime.c_str(),
          "%d:%d:%d %d:%d:%d",
          &year,
          &month,
          &day,
          &hour,
          &minute,
          &second) != 6) {
    return std::nullopt;
  }

  if (year < 1970 || month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 ||
      hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 60) {
    return std::nullopt;
  }

  std::tm utcTime{};
  utcTime.tm_year = year - 1900;
  utcTime.tm_mon = month - 1;
  utcTime.tm_mday = day;
  utcTime.tm_hour = hour;
  utcTime.tm_min = minute;
  utcTime.tm_sec = second;
  utcTime.tm_isdst = 0;

#if defined(_WIN32)
  const time_t seconds = _mkgmtime(&utcTime);
#else
  const time_t seconds = timegm(&utcTime);
#endif
  if (seconds < 0) {
    return std::nullopt;
  }

  return static_cast<int64_t>(seconds) * 1000LL;
}

} // namespace FaceDetection
