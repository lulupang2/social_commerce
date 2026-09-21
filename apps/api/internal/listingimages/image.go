package listingimages

import (
	"bytes"
	"encoding/binary"
	"image/jpeg"
	"image/png"
)

const MaxImageDimension = 4096

func validateImageBytes(data []byte, expectedMime string) error {
	if len(data) == 0 || int64(len(data)) > MaxFileSizeBytes {
		return errInvalid
	}
	switch canonicalMime(expectedMime) {
	case "image/jpeg":
		return validateJPEG(data)
	case "image/png":
		return validatePNG(data)
	case "image/webp":
		return validateWebP(data)
	default:
		return errInvalid
	}
}

func validateJPEG(data []byte) error {
	if len(data) < 4 || data[0] != 0xff || data[1] != 0xd8 ||
		data[len(data)-2] != 0xff || data[len(data)-1] != 0xd9 {
		return errInvalid
	}
	cfg, err := jpeg.DecodeConfig(bytes.NewReader(data))
	if err != nil || !validDimensions(cfg.Width, cfg.Height) {
		return errInvalid
	}
	if _, err = jpeg.Decode(bytes.NewReader(data)); err != nil {
		return errInvalid
	}
	return nil
}

func validatePNG(data []byte) error {
	const signature = "\x89PNG\r\n\x1a\n"
	if len(data) < len(signature) || string(data[:len(signature)]) != signature {
		return errInvalid
	}
	cfg, err := png.DecodeConfig(bytes.NewReader(data))
	if err != nil || !validDimensions(cfg.Width, cfg.Height) {
		return errInvalid
	}
	if _, err = png.Decode(bytes.NewReader(data)); err != nil {
		return errInvalid
	}
	return nil
}

func validateWebP(data []byte) error {
	if len(data) < 20 || string(data[:4]) != "RIFF" || string(data[8:12]) != "WEBP" {
		return errInvalid
	}
	declared := int64(binary.LittleEndian.Uint32(data[4:8])) + 8
	if declared != int64(len(data)) {
		return errInvalid
	}

	var canvasWidth, canvasHeight int
	var sawImage bool
	var animated bool
	for offset := 12; offset < len(data); {
		if offset+8 > len(data) {
			return errInvalid
		}
		kind := string(data[offset : offset+4])
		size := int(binary.LittleEndian.Uint32(data[offset+4 : offset+8]))
		start := offset + 8
		end := start + size
		if size < 0 || end < start || end > len(data) {
			return errInvalid
		}
		payload := data[start:end]

		switch kind {
		case "VP8X":
			if size != 10 || payload[0]&0xc1 != 0 {
				return errInvalid
			}
			canvasWidth = 1 + uint24LE(payload[4:7])
			canvasHeight = 1 + uint24LE(payload[7:10])
			if !validDimensions(canvasWidth, canvasHeight) {
				return errInvalid
			}
			animated = payload[0]&0x02 != 0
		case "VP8 ":
			width, height, ok := vp8Dimensions(payload)
			if !ok || !validDimensions(width, height) {
				return errInvalid
			}
			sawImage = true
			if canvasWidth != 0 && (width > canvasWidth || height > canvasHeight) {
				return errInvalid
			}
		case "VP8L":
			width, height, ok := vp8LDimensions(payload)
			if !ok || !validDimensions(width, height) {
				return errInvalid
			}
			sawImage = true
			if canvasWidth != 0 && (width > canvasWidth || height > canvasHeight) {
				return errInvalid
			}
		case "ANIM":
			if size != 6 {
				return errInvalid
			}
			animated = true
		case "ANMF":
			if size < 16 {
				return errInvalid
			}
			animated = true
			sawImage = true
		}

		offset = end
		if size&1 == 1 {
			if offset >= len(data) || data[offset] != 0 {
				return errInvalid
			}
			offset++
		}
	}
	if !sawImage || (animated && canvasWidth == 0) {
		return errInvalid
	}
	return nil
}

func vp8Dimensions(payload []byte) (int, int, bool) {
	if len(payload) < 10 || payload[3] != 0x9d || payload[4] != 0x01 || payload[5] != 0x2a {
		return 0, 0, false
	}
	width := int(binary.LittleEndian.Uint16(payload[6:8]) & 0x3fff)
	height := int(binary.LittleEndian.Uint16(payload[8:10]) & 0x3fff)
	return width, height, width > 0 && height > 0
}

func vp8LDimensions(payload []byte) (int, int, bool) {
	if len(payload) < 5 || payload[0] != 0x2f {
		return 0, 0, false
	}
	bits := binary.LittleEndian.Uint32(payload[1:5])
	if bits>>29 != 0 {
		return 0, 0, false
	}
	width := int(bits&0x3fff) + 1
	height := int((bits>>14)&0x3fff) + 1
	return width, height, true
}

func uint24LE(value []byte) int {
	return int(value[0]) | int(value[1])<<8 | int(value[2])<<16
}

func validDimensions(width, height int) bool {
	return width > 0 && height > 0 && width <= MaxImageDimension && height <= MaxImageDimension
}
