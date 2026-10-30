/* Gump desktop: portable libjpeg-turbo internal config. */
#pragma once

#define BUILD "gump-static"

#ifdef _MSC_VER
#define HIDDEN
#ifndef INLINE
#define INLINE __forceinline
#endif
#define THREAD_LOCAL __declspec(thread)
#ifdef _WIN64
#define SIZEOF_SIZE_T 8
#else
#define SIZEOF_SIZE_T 4
#endif
#define HAVE_INTRIN_H
#else
#define HIDDEN __attribute__((visibility("hidden")))
#ifndef INLINE
#define INLINE __inline__ __attribute__((always_inline))
#endif
#define THREAD_LOCAL __thread
#define SIZEOF_SIZE_T 8
#define HAVE_BUILTIN_CTZL
#endif

#define PACKAGE_NAME "libjpeg-turbo"
#define VERSION "3.0.4"

#if defined(__has_attribute)
#if __has_attribute(fallthrough)
#define FALLTHROUGH __attribute__((fallthrough));
#else
#define FALLTHROUGH
#endif
#else
#define FALLTHROUGH
#endif

#ifndef BITS_IN_JSAMPLE
#define BITS_IN_JSAMPLE 8
#endif

#undef C_ARITH_CODING_SUPPORTED
#undef D_ARITH_CODING_SUPPORTED
#undef WITH_SIMD

#if BITS_IN_JSAMPLE == 8
#define C_ARITH_CODING_SUPPORTED 1
#define D_ARITH_CODING_SUPPORTED 1
#endif
