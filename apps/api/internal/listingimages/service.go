package listingimages

import (
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
		s.markFailedDetached(record)
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
		s.quarantineDetached(record)
		return CompleteResult{}, errExpired
	}
	info, err := s.Storage.Info(ctx, record.StoragePath)
	if errors.Is(err, ErrObjectNotFound) {
		s.markFailedDetached(record)
		return CompleteResult{}, errIncomplete
	}
	if err != nil {
		return CompleteResult{}, errStorage
	}
	if canonicalMime(info.MimeType) != canonicalMime(record.MimeType) ||
		info.FileSizeBytes != record.FileSizeBytes ||
		info.FileSizeBytes <= 0 || info.FileSizeBytes > MaxFileSizeBytes ||
		!allowedMime(info.MimeType) {
		s.quarantineDetached(record)
		return CompleteResult{}, errInvalid
	}
	data, err := s.Storage.ReadObject(ctx, record.StoragePath, record.FileSizeBytes)
	if errors.Is(err, ErrObjectNotFound) {
		s.markFailedDetached(record)
		return CompleteResult{}, errIncomplete
	}
	if errors.Is(err, ErrObjectTooLarge) {
		s.quarantineDetached(record)
		return CompleteResult{}, errInvalid
	}
	if err != nil {
		return CompleteResult{}, errStorage
	}
	if int64(len(data)) != record.FileSizeBytes || validateImageBytes(data, record.MimeType) != nil {
		s.quarantineDetached(record)
		return CompleteResult{}, errInvalid
	}
	completed, replaced, err := s.Repo.CompleteUpload(ctx, memberID, listingID, imageID)
	if err != nil {
		if errors.Is(err, errExpired) {
			s.quarantineDetached(record)
		}
		return CompleteResult{}, err
	}
	if replaced != nil {
		s.cleanupReplacedDetached(*replaced)
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
	if err = s.Repo.FinishDelete(ctx, memberID, listingID, imageID); err == nil || errors.Is(err, errNotFound) {
		return nil
	}
	if retryErr := s.finishDeleteDetached(record); retryErr == nil || errors.Is(retryErr, errNotFound) {
		return nil
	}
	return err
}

func (s *Service) markFailedDetached(record ImageRecord) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = s.Repo.FailUpload(ctx, record.MemberID, record.ListingID, record.ID)
}

func (s *Service) quarantineDetached(record ImageRecord) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = s.Repo.FailUpload(ctx, record.MemberID, record.ListingID, record.ID)
	if err := s.Storage.Delete(ctx, record.StoragePath); err != nil && !errors.Is(err, ErrObjectNotFound) {
		return
	}
}

func (s *Service) cleanupReplacedDetached(record ImageRecord) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := s.Storage.Delete(ctx, record.StoragePath); err != nil && !errors.Is(err, ErrObjectNotFound) {
		return
	}
	_ = s.Repo.FinishDelete(ctx, record.MemberID, record.ListingID, record.ID)
}

func (s *Service) finishDeleteDetached(record ImageRecord) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return s.Repo.FinishDelete(ctx, record.MemberID, record.ListingID, record.ID)
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now().UTC()
	}
	return time.Now().UTC()
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
