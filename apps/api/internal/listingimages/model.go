package listingimages

import (
	"bytes"
	"encoding/json"
	"errors"
	"strings"
	"time"
)

const (
	Prefix           = "/api/v1/listings"
	MaxImages        = 12
	MaxFileSizeBytes = 10 * 1024 * 1024
	MaxDimension     = 4096
)

type Failure struct {
	Status  int
	Code    string
	Message string
}

func (e *Failure) Error() string { return e.Code }

var (
	errInvalid          = &Failure{400, "LISTING_IMAGE_INVALID", "Listing image information is invalid"}
	errListingNotFound  = &Failure{404, "LISTING_NOT_FOUND", "Listing was not found"}
	errImageNotFound    = &Failure{404, "LISTING_IMAGE_NOT_FOUND", "Listing image was not found"}
	errLimitReached     = &Failure{409, "LISTING_IMAGE_LIMIT_REACHED", "Listing image limit has been reached"}
	errSortConflict     = &Failure{409, "LISTING_IMAGE_SORT_CONFLICT", "Listing image sort order is already in use"}
	errStateConflict    = &Failure{409, "LISTING_IMAGE_STATE_CONFLICT", "Listing images cannot be changed in the current listing state"}
	errTooLarge         = &Failure{413, "LISTING_IMAGE_TOO_LARGE", "Listing image exceeds the maximum size"}
	errMediaUnsupported = &Failure{415, "LISTING_IMAGE_MEDIA_TYPE_UNSUPPORTED", "Listing image media type is not supported"}
	errStorage          = &Failure{503, "LISTING_IMAGE_STORAGE_UNAVAILABLE", "Listing image storage is unavailable"}
	errDB               = &Failure{503, "LISTING_DATABASE_UNAVAILABLE", "Listing storage is unavailable"}
)

type Record struct {
	ID          string
	ListingID   string
	StoragePath string
	AltText     *string
	SortOrder   int
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

type View struct {
	ID        string     `json:"id"`
	State     string     `json:"state"`
	URL       *string    `json:"url,omitempty"`
	ExpiresAt *time.Time `json:"expiresAt,omitempty"`
	Reason    *string    `json:"reason,omitempty"`
	AltText   *string    `json:"altText"`
	SortOrder int        `json:"sortOrder"`
}

type ImageFile struct {
	Bytes     []byte
	MIMEType  string
	Extension string
	Width     int
	Height    int
}

type CreateInput struct {
	File      ImageFile
	AltText   *string
	SortOrder *int
}

type PatchInput struct {
	AltTextSet bool
	AltText    *string
	SortOrder  *int
}

type ReplaceInput struct {
	File       ImageFile
	AltTextSet bool
	AltText    *string
}

type optionalString struct {
	Set   bool
	Value *string
}

func (o *optionalString) UnmarshalJSON(data []byte) error {
	o.Set = true
	if bytes.Equal(bytes.TrimSpace(data), []byte("null")) {
		o.Value = nil
		return nil
	}
	var value string
	if err := json.Unmarshal(data, &value); err != nil {
		return err
	}
	o.Value = &value
	return nil
}

type patchPayload struct {
	AltText   optionalString `json:"altText"`
	SortOrder *int           `json:"sortOrder"`
}

func normalizeAltText(value *string) (*string, error) {
	if value == nil {
		return nil, nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil, nil
	}
	if len([]rune(trimmed)) > 160 {
		return nil, errInvalid
	}
	return &trimmed, nil
}

func validateSortOrder(value *int) error {
	if value != nil && *value < 0 {
		return errInvalid
	}
	return nil
}

func mutableListingStatus(status string) bool {
	return status == "draft" || status == "pending_review" || status == "rejected"
}

func asFailure(err error) (*Failure, bool) {
	var failure *Failure
	if errors.As(err, &failure) {
		return failure, true
	}
	return nil, false
}
