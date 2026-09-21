package listingimages

import (
	"errors"
	"strings"
	"time"
)

const (
	Prefix             = "/api/v1/listings"
	Bucket             = "listing-images"
	MaxImages          = 12
	MaxFileSizeBytes   = int64(10 * 1024 * 1024)
	SignedReadTTL      = 10 * time.Minute
	SignedUploadTTL    = 2 * time.Hour
	PendingUploadState = "pending_upload"
	ReadyState         = "ready"
	FailedState        = "upload_failed"
	DeletingState      = "deleting"
)

type Failure struct {
	Status  int
	Code    string
	Message string
}

func (e *Failure) Error() string { return e.Code }

var (
	errInvalid            = &Failure{400, "IMAGE_INVALID", "Image information is invalid"}
	errNotFound           = &Failure{404, "IMAGE_NOT_FOUND", "Image or listing was not found"}
	errLimit              = &Failure{409, "IMAGE_LIMIT_EXCEEDED", "The listing already has the maximum number of images"}
	errConflict           = &Failure{409, "IMAGE_CONFLICT", "The image position is already in use"}
	errIncomplete         = &Failure{409, "IMAGE_UPLOAD_INCOMPLETE", "The image upload has not completed"}
	errExpired            = &Failure{410, "IMAGE_UPLOAD_EXPIRED", "The image upload slot has expired"}
	errStorage            = &Failure{503, "IMAGE_STORAGE_UNAVAILABLE", "Image storage is unavailable"}
	errDB                 = &Failure{503, "IMAGE_DATABASE_UNAVAILABLE", "Image metadata storage is unavailable"}
	ErrObjectNotFound     = errors.New("storage object not found")
	ErrObjectTooLarge     = errors.New("storage object exceeds validation limit")
	ErrStorageUnavailable = errors.New("storage unavailable")
)

type UploadInput struct {
	MimeType       string  `json:"mimeType"`
	FileSizeBytes  int64   `json:"fileSizeBytes"`
	AltText        *string `json:"altText"`
	SortOrder      *int    `json:"sortOrder"`
	ReplaceImageID *string `json:"replaceImageId"`
}

type UploadSlot struct {
	ImageID   string    `json:"imageId"`
	UploadURL string    `json:"uploadUrl"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type SignedImage struct {
	ID        string    `json:"id"`
	State     string    `json:"state"`
	URL       string    `json:"url"`
	ExpiresAt time.Time `json:"expiresAt"`
	AltText   *string   `json:"altText,omitempty"`
	SortOrder int       `json:"sortOrder"`
}

// View is the public image shape embedded in listing responses.
type View = SignedImage

type ImageRecord struct {
	ID              string
	ListingID       string
	MemberID        string
	StoragePath     string
	MimeType        string
	FileSizeBytes   int64
	AltText         *string
	SortOrder       int
	State           string
	UploadExpiresAt time.Time
	CompletedAt     *time.Time
	ReplaceImageID  *string
}

type ObjectInfo struct {
	MimeType      string
	FileSizeBytes int64
}

func normalizeInput(input UploadInput) UploadInput {
	input.MimeType = strings.ToLower(strings.TrimSpace(input.MimeType))
	if input.AltText != nil {
		value := strings.TrimSpace(*input.AltText)
		input.AltText = &value
	}
	if input.ReplaceImageID != nil {
		value := strings.TrimSpace(*input.ReplaceImageID)
		input.ReplaceImageID = &value
	}
	return input
}

func validateInput(input UploadInput) error {
	if !allowedMime(input.MimeType) || input.FileSizeBytes <= 0 || input.FileSizeBytes > MaxFileSizeBytes {
		return errInvalid
	}
	if input.AltText != nil {
		n := len([]rune(*input.AltText))
		if n < 1 || n > 160 {
			return errInvalid
		}
	}
	if input.ReplaceImageID == nil {
		if input.SortOrder == nil || *input.SortOrder < 0 || *input.SortOrder >= MaxImages {
			return errInvalid
		}
	} else if *input.ReplaceImageID == "" || (input.SortOrder != nil && (*input.SortOrder < 0 || *input.SortOrder >= MaxImages)) {
		return errInvalid
	}
	return nil
}

func allowedMime(value string) bool {
	switch value {
	case "image/jpeg", "image/jpg", "image/png", "image/webp":
		return true
	default:
		return false
	}
}

func canonicalMime(value string) string {
	if value == "image/jpg" {
		return "image/jpeg"
	}
	return value
}
