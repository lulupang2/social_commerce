package listingimages

import (
	"encoding/binary"
	"testing"
)

func TestInspectImageFormatsAndLimits(t *testing.T) {
	cases := []struct {
		name, declared, mime, ext string
		data                      []byte
	}{
		{"jpeg", "image/jpg", "image/jpeg", "jpg", testJPEG(640, 480)},
		{"png", "image/png", "image/png", "png", testPNG(800, 600)},
		{"webp", "image/webp", "image/webp", "webp", testWebP(1024, 768)},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			image, err := inspectImage(tc.data, tc.declared)
			if err != nil {
				t.Fatal(err)
			}
			if image.MIMEType != tc.mime || image.Extension != tc.ext || image.Width < 1 || image.Height < 1 {
				t.Fatalf("unexpected image metadata: %#v", image)
			}
		})
	}

	if _, err := inspectImage(testPNG(4097, 1), "image/png"); err != errInvalid {
		t.Fatalf("oversized dimensions returned %v", err)
	}
	if _, err := inspectImage(testPNG(10, 10), "image/jpeg"); err != errMediaUnsupported {
		t.Fatalf("MIME mismatch returned %v", err)
	}
	if _, err := inspectImage([]byte("not-an-image"), "image/png"); err != errMediaUnsupported {
		t.Fatalf("invalid bytes returned %v", err)
	}
	if _, err := inspectImage(make([]byte, MaxFileSizeBytes+1), "image/png"); err != errTooLarge {
		t.Fatalf("oversized file returned %v", err)
	}
}

func testPNG(width, height uint32) []byte {
	data := make([]byte, 24)
	copy(data[:8], []byte{0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a})
	binary.BigEndian.PutUint32(data[8:12], 13)
	copy(data[12:16], "IHDR")
	binary.BigEndian.PutUint32(data[16:20], width)
	binary.BigEndian.PutUint32(data[20:24], height)
	return data
}

func testJPEG(width, height uint16) []byte {
	data := make([]byte, 2+2+17)
	data[0], data[1] = 0xff, 0xd8
	data[2], data[3] = 0xff, 0xc0
	binary.BigEndian.PutUint16(data[4:6], 17)
	data[6] = 8
	binary.BigEndian.PutUint16(data[7:9], height)
	binary.BigEndian.PutUint16(data[9:11], width)
	return data
}

func testWebP(width, height int) []byte {
	data := make([]byte, 30)
	copy(data[:4], "RIFF")
	copy(data[8:12], "WEBP")
	copy(data[12:16], "VP8X")
	w := width - 1
	h := height - 1
	data[24], data[25], data[26] = byte(w), byte(w>>8), byte(w>>16)
	data[27], data[28], data[29] = byte(h), byte(h>>8), byte(h>>16)
	return data
}
