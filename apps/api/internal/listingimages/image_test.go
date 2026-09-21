package listingimages

import "testing"

// Signature coverage retained for the signed-upload completion contract.
// Full decoding/dimension enforcement is a mandatory B completion gate.
func TestImageSignatureFormats(t *testing.T) {
	for _, tc := range []struct {
		data []byte
		want string
	}{
		{[]byte{0xff, 0xd8, 0xff}, "image/jpeg"},
		{[]byte{0x89, 'P', 'N', 'G', 13, 10, 26, 10}, "image/png"},
		{[]byte("RIFF1234WEBP"), "image/webp"},
		{[]byte("not an image"), ""}, {nil, ""}, {[]byte{0xff, 0xd8}, ""},
	} {
		if got := detectImageMime(tc.data); got != tc.want {
			t.Fatalf("got %q want %q", got, tc.want)
		}
	}
}
