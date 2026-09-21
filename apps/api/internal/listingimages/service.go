package listingimages

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"time"
)

type Service struct {
	Repo    Repository
	Storage Storage
	Now     func() time.Time
}

type CompleteResult struct {
	ImageID string `json:"imageId"`
	State   string `json:"state"`
}

func (s *Service) StartUpload(ctx context.Context, memberID, listingID string, raw UploadInput) (UploadSlot, error) {
	input := normalizeInput(raw)
	input.MimeType = canonicalMime(input.MimeType)
	if err := validateInput(input); err != nil {
		return UploadSlot{}, err
	}
	imageID, err := randomUUID()
	if err != nil {
		return UploadSlot{}, errStorage
	}
	now := s.now()
	expiresAt := now.Add(SignedUploadTTL)
	storagePath := memberID + "/" + listingID + "/" + imageID
	record, err := s.Repo.BeginUpload(ctx, memberID, listingID, input, storagePath, expiresAt)
	if err != nil {
		return UploadSlot{}, err
	}
	uploadURL, err := s.Storage.CreateSignedUpload(ctx, record.StoragePath)
	if err != nil {
		_ = s.Repo.FailUpload(ctx, memberID, listingID, record.ID)
		return UploadSlot{}, errStorage
	}
	return UploadSlot{ImageID: record.ID, UploadURL: uploadURL, ExpiresAt: record.UploadExpiresAt}, nil
}

func (s *Service) Complete(ctx context.Context, memberID, listingID, imageID string) (CompleteResult, error) {
	record, err := s.Repo.PendingOwned(ctx, memberID, listingID, imageID)
	if err != nil {
		return CompleteResult{}, err
	}
	if !record.UploadExpiresAt.After(s.now()) {
		_ = s.Storage.Delete(ctx, record.StoragePath)
		_ = s.Repo.FailUpload(ctx, memberID, listingID, imageID)
		return CompleteResult{}, errExpired
	}
	info, err := s.Storage.Info(ctx, record.StoragePath)
	if errors.Is(err, ErrObjectNotFound) {
		_ = s.Repo.FailUpload(ctx, memberID, listingID, imageID)
		return CompleteResult{}, errIncomplete
	}
	if err != nil {
		return CompleteResult{}, errStorage
	}
	if canonicalMime(info.MimeType) != canonicalMime(record.MimeType) ||
		info.FileSizeBytes != record.FileSizeBytes ||
		info.FileSizeBytes <= 0 || info.FileSizeBytes > MaxFileSizeBytes ||
		!allowedMime(info.MimeType) {
		_ = s.Storage.Delete(ctx, record.StoragePath)
		_ = s.Repo.FailUpload(ctx, memberID, listingID, imageID)
		return CompleteResult{}, errInvalid
	}
	prefix, err := s.Storage.ReadPrefix(ctx, record.StoragePath)
	if errors.Is(err, ErrObjectNotFound) {
		_ = s.Repo.FailUpload(ctx, memberID, listingID, imageID)
		return CompleteResult{}, errIncomplete
	}
	if err != nil {
		return CompleteResult{}, errStorage
	}
	if detected := detectImageMime(prefix); detected == "" || detected != canonicalMime(record.MimeType) {
		_ = s.Storage.Delete(ctx, record.StoragePath)
		_ = s.Repo.FailUpload(ctx, memberID, listingID, imageID)
		return CompleteResult{}, errInvalid
	}
	completed, replaced, err := s.Repo.CompleteUpload(ctx, memberID, listingID, imageID)
	if err != nil {
		return CompleteResult{}, err
	}
	if replaced != nil {
		if deleteErr := s.Storage.Delete(ctx, replaced.StoragePath); deleteErr == nil || errors.Is(deleteErr, ErrObjectNotFound) {
			_ = s.Repo.FinishDelete(ctx, memberID, listingID, replaced.ID)
		}
	}
	return CompleteResult{ImageID: completed.ID, State: ReadyState}, nil
}

func (s *Service) List(ctx context.Context, listingID, memberID string) ([]SignedImage, error) {
	records, err := s.Repo.VisibleReady(ctx, listingID, memberID)
	if err != nil {
		return nil, err
	}
	now := s.now()
	result := make([]SignedImage, 0, len(records))
	for _, record := range records {
		signedURL, err := s.Storage.Sign(ctx, record.StoragePath, SignedReadTTL)
		if err != nil {
			return nil, errStorage
		}
		result = append(result, SignedImage{
			ID: record.ID, State: "signed", URL: signedURL, ExpiresAt: now.Add(SignedReadTTL),
			AltText: record.AltText, SortOrder: record.SortOrder,
		})
	}
	return result, nil
}

func (s *Service) Delete(ctx context.Context, memberID, listingID, imageID string) error {
	record, err := s.Repo.BeginDelete(ctx, memberID, listingID, imageID)
	if err != nil {
		return err
	}
	err = s.Storage.Delete(ctx, record.StoragePath)
	if err != nil && !errors.Is(err, ErrObjectNotFound) {
		return errStorage
	}
	return s.Repo.FinishDelete(ctx, memberID, listingID, imageID)
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now().UTC()
	}
	return time.Now().UTC()
}

func detectImageMime(prefix []byte) string {
	if len(prefix) >= 3 && prefix[0] == 0xff && prefix[1] == 0xd8 && prefix[2] == 0xff {
		return "image/jpeg"
	}
	if len(prefix) >= 8 && bytes.Equal(prefix[:8], []byte{0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a}) {
		return "image/png"
	}
	if len(prefix) >= 12 && string(prefix[:4]) == "RIFF" && string(prefix[8:12]) == "WEBP" {
		return "image/webp"
	}
	return ""
}

func randomUUID() (string, error) {
	var value [16]byte
	if _, err := rand.Read(value[:]); err != nil {
		return "", err
	}
	value[6] = (value[6] & 0x0f) | 0x40
	value[8] = (value[8] & 0x3f) | 0x80
	var out [36]byte
	hex.Encode(out[0:8], value[0:4])
	out[8] = '-'
	hex.Encode(out[9:13], value[4:6])
	out[13] = '-'
	hex.Encode(out[14:18], value[6:8])
	out[18] = '-'
	hex.Encode(out[19:23], value[8:10])
	out[23] = '-'
	hex.Encode(out[24:36], value[10:16])
	return string(out[:]), nil
}
