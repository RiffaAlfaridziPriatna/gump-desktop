#pragma once

#include <cstdint>
#include <filesystem>
#include <fstream>
#include <stdexcept>
#include <string>
#include <vector>

namespace ZipStore {

struct Entry {
  std::filesystem::path sourcePath;
  std::string entryName;
};

struct Result {
  uint64_t byteSize{0};
};

inline uint32_t Crc32Update(uint32_t crc, const uint8_t *data, size_t length) {
  static uint32_t table[256];
  static bool ready = false;
  if (!ready) {
    for (uint32_t i = 0; i < 256; i++) {
      uint32_t value = i;
      for (int bit = 0; bit < 8; bit++) {
        value = (value & 1u) ? (0xEDB88320u ^ (value >> 1)) : (value >> 1);
      }
      table[i] = value;
    }
    ready = true;
  }

  // ZIP/zlib incremental CRC32: invert at boundaries of the whole stream.
  crc = ~crc;
  for (size_t i = 0; i < length; i++) {
    crc = table[(crc ^ data[i]) & 0xFFu] ^ (crc >> 8);
  }
  return ~crc;
}

inline void WriteU16(std::ofstream &out, uint16_t value) {
  const uint8_t bytes[2] = {
      static_cast<uint8_t>(value & 0xFFu),
      static_cast<uint8_t>((value >> 8) & 0xFFu),
  };
  out.write(reinterpret_cast<const char *>(bytes), 2);
}

inline void WriteU32(std::ofstream &out, uint32_t value) {
  const uint8_t bytes[4] = {
      static_cast<uint8_t>(value & 0xFFu),
      static_cast<uint8_t>((value >> 8) & 0xFFu),
      static_cast<uint8_t>((value >> 16) & 0xFFu),
      static_cast<uint8_t>((value >> 24) & 0xFFu),
  };
  out.write(reinterpret_cast<const char *>(bytes), 4);
}

inline Result CreateZip(
    const std::filesystem::path &zipPath,
    const std::vector<Entry> &entries) {
  std::ofstream out(zipPath, std::ios::binary | std::ios::trunc);
  if (!out) {
    throw std::runtime_error("Unable to create zip file");
  }

  struct CentralRecord {
    std::string name;
    uint32_t crc32{0};
    uint32_t size{0};
    uint32_t localHeaderOffset{0};
  };

  std::vector<CentralRecord> centrals;
  centrals.reserve(entries.size());

  for (const auto &entry : entries) {
    if (entry.entryName.empty()) {
      throw std::runtime_error("Zip entry name is empty");
    }
    if (!std::filesystem::exists(entry.sourcePath)) {
      throw std::runtime_error("Zip source file not found");
    }

    std::ifstream input(entry.sourcePath, std::ios::binary);
    if (!input) {
      throw std::runtime_error("Unable to open zip source file");
    }

    uint32_t crc = 0;
    uint32_t size = 0;
    std::vector<uint8_t> buffer(64 * 1024);
    while (input) {
      input.read(reinterpret_cast<char *>(buffer.data()), static_cast<std::streamsize>(buffer.size()));
      const auto readCount = static_cast<size_t>(input.gcount());
      if (readCount == 0) {
        break;
      }
      crc = Crc32Update(crc, buffer.data(), readCount);
      size += static_cast<uint32_t>(readCount);
    }
    input.clear();
    input.seekg(0, std::ios::beg);

    const auto localHeaderOffset = static_cast<uint32_t>(out.tellp());
    const auto nameBytes = entry.entryName.size();
    if (nameBytes > 0xFFFFu) {
      throw std::runtime_error("Zip entry name is too long");
    }

    WriteU32(out, 0x04034b50u); // local file header signature
    WriteU16(out, 20);          // version needed
    WriteU16(out, 0);           // flags
    WriteU16(out, 0);           // compression method = store
    WriteU16(out, 0);           // mod time
    WriteU16(out, 0);           // mod date
    WriteU32(out, crc);
    WriteU32(out, size);
    WriteU32(out, size);
    WriteU16(out, static_cast<uint16_t>(nameBytes));
    WriteU16(out, 0); // extra length
    out.write(entry.entryName.data(), static_cast<std::streamsize>(nameBytes));

    while (input) {
      input.read(reinterpret_cast<char *>(buffer.data()), static_cast<std::streamsize>(buffer.size()));
      const auto readCount = static_cast<size_t>(input.gcount());
      if (readCount == 0) {
        break;
      }
      out.write(reinterpret_cast<const char *>(buffer.data()), static_cast<std::streamsize>(readCount));
    }

    centrals.push_back(CentralRecord{
        entry.entryName,
        crc,
        size,
        localHeaderOffset,
    });
  }

  const auto centralDirectoryOffset = static_cast<uint32_t>(out.tellp());
  for (const auto &central : centrals) {
    const auto nameBytes = central.name.size();
    WriteU32(out, 0x02014b50u); // central directory header
    WriteU16(out, 20);          // version made by
    WriteU16(out, 20);          // version needed
    WriteU16(out, 0);           // flags
    WriteU16(out, 0);           // compression
    WriteU16(out, 0);           // mod time
    WriteU16(out, 0);           // mod date
    WriteU32(out, central.crc32);
    WriteU32(out, central.size);
    WriteU32(out, central.size);
    WriteU16(out, static_cast<uint16_t>(nameBytes));
    WriteU16(out, 0); // extra
    WriteU16(out, 0); // comment
    WriteU16(out, 0); // disk start
    WriteU16(out, 0); // internal attrs
    WriteU32(out, 0); // external attrs
    WriteU32(out, central.localHeaderOffset);
    out.write(central.name.data(), static_cast<std::streamsize>(nameBytes));
  }

  const auto centralDirectorySize =
      static_cast<uint32_t>(out.tellp()) - centralDirectoryOffset;
  WriteU32(out, 0x06054b50u); // end of central directory
  WriteU16(out, 0);           // disk number
  WriteU16(out, 0);           // central dir disk
  WriteU16(out, static_cast<uint16_t>(centrals.size()));
  WriteU16(out, static_cast<uint16_t>(centrals.size()));
  WriteU32(out, centralDirectorySize);
  WriteU32(out, centralDirectoryOffset);
  WriteU16(out, 0); // comment length

  out.flush();
  if (!out) {
    throw std::runtime_error("Failed while writing zip file");
  }
  out.close();

  return Result{static_cast<uint64_t>(std::filesystem::file_size(zipPath))};
}

} // namespace ZipStore
