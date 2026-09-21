package listingimages

import (
	"encoding/binary"
	"mime"
	"strings"
)

func inspectImage(data []byte, declared string) (ImageFile, error) {
	if len(data) == 0 {
		return ImageFile{}, errInvalid
	}
	if len(data) > MaxFileSizeBytes {
		return ImageFile{}, errTooLarge
	}

	declaredType, _, err := mime.ParseMediaType(strings.TrimSpace(declared))
	if err != nil {
		return ImageFile{}, errMediaUnsupported
	}
	declaredType = canonicalMIME(declaredType)
	if !allowedMIME(declaredType) {
		return ImageFile{}, errMediaUnsupported
	}

	actualType, extension, width, height := detectImage(data)
	if actualType == "" || actualType != declaredType {
		return ImageFile{}, errMediaUnsupported
	}
	if width < 1 || height < 1 || width > MaxDimension || height > MaxDimension {
		return ImageFile{}, errInvalid
	}
	return ImageFile{
		Bytes: data, MIMEType: actualType, Extension: extension, Width: width, Height: height,
	}, nil
}

func canonicalMIME(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value == "image/jpg" {
		return "image/jpeg"
	}
	return value
}

func allowedMIME(value string) bool {
	switch canonicalMIME(value) {
	case "image/jpeg", "image/png", "image/webp":
		return true
	default:
		return false
	}
}

func detectImage(data []byte) (mimeType, extension string, width, height int) {
	if w, h, ok := pngDimensions(data); ok {
		return "image/png", "png", w, h
	}
	if w, h, ok := jpegDimensions(data); ok {
		return "image/jpeg", "jpg", w, h
	}
	if w, h, ok := webpDimensions(data); ok {
		return "image/webp", "webp", w, h
	}
	return "", "", 0, 0
}

func pngDimensions(data []byte) (int, int, bool) {
	signature := []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a}
	if len(data) < 24 {
		return 0, 0, false
	}
	for i := range signature {
		if data[i] != signature[i] {
			return 0, 0, false
		}
	}
	if string(data[12:16]) != "IHDR" {
		return 0, 0, false
	}
	width := binary.BigEndian.Uint32(data[16:20])
	height := binary.BigEndian.Uint32(data[20:24])
	if width == 0 || height == 0 {
		return 0, 0, false
	}
	if width > MaxDimension {
		width = MaxDimension + 1
	}
	if height > MaxDimension {
		height = MaxDimension + 1
	}
	return int(width), int(height), true
}

func jpegDimensions(data []byte) (int, int, bool) {
	if len(data) < 4 || data[0] != 0xff || data[1] != 0xd8 {
		return 0, 0, false
	}
	for i := 2; i+1 < len(data); {
		if data[i] != 0xff {
			i++
			continue
		}
		for i < len(data) && data[i] == 0xff {
			i++
		}
		if i >= len(data) {
			return 0, 0, false
		}
		marker := data[i]
		i++
		if marker == 0xd9 || marker == 0xda {
			return 0, 0, false
		}
		if marker == 0x01 || marker >= 0xd0 && marker <= 0xd7 {
			continue
		}
		if i+2 > len(data) {
			return 0, 0, false
		}
		length := int(binary.BigEndian.Uint16(data[i : i+2]))
		if length < 2 || i+length > len(data) {
			return 0, 0, false
		}
		if isJPEGSOF(marker) {
			if length < 7 {
				return 0, 0, false
			}
			height := int(binary.BigEndian.Uint16(data[i+3 : i+5]))
			width := int(binary.BigEndian.Uint16(data[i+5 : i+7]))
			return width, height, width > 0 && height > 0
		}
		i += length
	}
	return 0, 0, false
}

func isJPEGSOF(marker byte) bool {
	switch marker {
	case 0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf:
		return true
	default:
		return false
	}
}

func webpDimensions(data []byte) (int, int, bool) {
	if len(data) < 30 || string(data[:4]) != "RIFF" || string(data[8:12]) != "WEBP" {
		return 0, 0, false
	}
	switch string(data[12:16]) {
	case "VP8X":
		width := 1 + int(data[24]) + int(data[25])<<8 + int(data[26])<<16
		height := 1 + int(data[27]) + int(data[28])<<8 + int(data[29])<<16
		return width, height, width > 0 && height > 0
	case "VP8L":
		if data[20] != 0x2f || len(data) < 25 {
			return 0, 0, false
		}
		bits := binary.LittleEndian.Uint32(data[21:25])
		width := int(bits&0x3fff) + 1
		height := int((bits>>14)&0x3fff) + 1
		return width, height, width > 0 && height > 0
	case "VP8 ":
		if len(data) < 30 || data[23] != 0x9d || data[24] != 0x01 || data[25] != 0x2a {
			return 0, 0, false
		}
		width := int(binary.LittleEndian.Uint16(data[26:28]) & 0x3fff)
		height := int(binary.LittleEndian.Uint16(data[28:30]) & 0x3fff)
		return width, height, width > 0 && height > 0
	default:
		return 0, 0, false
	}
}
