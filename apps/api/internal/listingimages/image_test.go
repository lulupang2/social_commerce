package listingimages

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

func TestValidateImageBytesRejectsTruncationSpoofAndOversizeDimensions(t *testing.T) {
	jpegData := makeJPEG(t, 32, 24)
	pngData := makePNG(t, 32, 24)
	webpData := makeWebP(32, 24)

	for name, tc := range map[string]struct {
		data []byte
		mime string
	}{
		"jpeg": {jpegData, "image/jpeg"},
		"png":  {pngData, "image/png"},
		"webp": {webpData, "image/webp"},
	} {
		t.Run(name+"_valid", func(t *testing.T) {
			if err := validateImageBytes(tc.data, tc.mime); err != nil {
				t.Fatalf("valid image rejected: %v", err)
			}
		})
		t.Run(name+"_truncated", func(t *testing.T) {
			cut := len(tc.data) - 1
			if name != "webp" {
				cut = len(tc.data) / 2
			}
			if err := validateImageBytes(tc.data[:cut], tc.mime); err == nil {
				t.Fatal("truncated image accepted")
			}
		})
	}

	if err := validateImageBytes(pngData, "image/jpeg"); err == nil {
		t.Fatal("PNG bytes accepted behind JPEG metadata")
	}
	if err := validateImageBytes(makePNG(t, MaxImageDimension+1, 1), "image/png"); err == nil {
		t.Fatal("oversized PNG dimensions accepted")
	}
	if err := validateImageBytes(makeJPEG(t, 1, MaxImageDimension+1), "image/jpeg"); err == nil {
		t.Fatal("oversized JPEG dimensions accepted")
	}
	if err := validateImageBytes(makeWebP(MaxImageDimension+1, 1), "image/webp"); err == nil {
		t.Fatal("oversized WebP dimensions accepted")
	}
}

func makeJPEG(t *testing.T, width, height int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x), G: uint8(y), B: 120, A: 255})
		}
	}
	var out bytes.Buffer
	if err := jpeg.Encode(&out, img, &jpeg.Options{Quality: 80}); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}

func makePNG(t *testing.T, width, height int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.RGBA{R: 40, G: uint8(x), B: uint8(y), A: 255})
		}
	}
	var out bytes.Buffer
	if err := png.Encode(&out, img); err != nil {
		t.Fatal(err)
	}
	return out.Bytes()
}

func makeWebP(width, height int) []byte {
	bits := uint32(width-1) | uint32(height-1)<<14
	payload := make([]byte, 6)
	payload[0] = 0x2f
	binary.LittleEndian.PutUint32(payload[1:5], bits)
	payload[5] = 0
	data := make([]byte, 12+8+len(payload))
	copy(data[0:4], "RIFF")
	copy(data[8:12], "WEBP")
	copy(data[12:16], "VP8L")
	binary.LittleEndian.PutUint32(data[16:20], uint32(len(payload)))
	copy(data[20:], payload)
	binary.LittleEndian.PutUint32(data[4:8], uint32(len(data)-8))
	return data
}
