#include "ExifDateTime.h"

#include <ctime>

namespace FaceDetection {
namespace {

bool IsDigit(char character) {
  return character >= '0' && character <= '9';
}

bool ReadTwoDigits(const char *text, int &outValue) {
  if (!IsDigit(text[0]) || !IsDigit(text[1])) {
    return false;
  }
  outValue = (text[0] - '0') * 10 + (text[1] - '0');
  return true;
}

bool ReadFourDigits(const char *text, int &outValue) {
  if (!IsDigit(text[0]) || !IsDigit(text[1]) || !IsDigit(text[2]) || !IsDigit(text[3])) {
    return false;
  }
  outValue = (text[0] - '0') * 1000 + (text[1] - '0') * 100 + (text[2] - '0') * 10 +
             (text[3] - '0');
  return true;
}

/// Parse EXIF "yyyy:MM:dd HH:mm:ss" without scanf (MSVC treats sscanf as C4996).
bool ParseExifDateTimeParts(
    const std::string &dateTime,
    int &year,
    int &month,
    int &day,
    int &hour,
    int &minute,
    int &second) {
  if (dateTime.size() < 19) {
    return false;
  }
  const char *text = dateTime.c_str();
  if (!ReadFourDigits(text, year) || text[4] != ':' || !ReadTwoDigits(text + 5, month) ||
      text[7] != ':' || !ReadTwoDigits(text + 8, day) || text[10] != ' ' ||
      !ReadTwoDigits(text + 11, hour) || text[13] != ':' || !ReadTwoDigits(text + 14, minute) ||
      text[16] != ':' || !ReadTwoDigits(text + 17, second)) {
    return false;
  }
  return true;
}

} // namespace

std::optional<int64_t> parseExifDateTimeToUnixMillisUtc(const std::string &dateTime) {
  int year = 0;
  int month = 0;
  int day = 0;
  int hour = 0;
  int minute = 0;
  int second = 0;
  if (!ParseExifDateTimeParts(dateTime, year, month, day, hour, minute, second)) {
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
