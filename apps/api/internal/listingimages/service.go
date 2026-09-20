package listingimages

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"log/slog"
	"time"
)

type Service struct {
	Repo    Repository
	Storage Storage
	TTL     time.Duration
	Logger  *slog.Logger
	Now     func() time.Time
}

func (s *Service) ListVisible(ctx context.Context, listingID, memberID string) ([]View, error) {
	records, err := s.Repo.ListVisible(ctx, listingID, memberID)
	if err != nil {
		return nil, err
	}
	views := make([]View, 0, len(records))
	for _, record := range records {
		view, err := s.signRecord(ctx, record)
		if err != nil {
			return nil, err
		}
		views = append(views, view)
	}
	return views, nil
}

func (s *Service) Create(ctx context.Context, memberID, listingID string, input CreateInput) (View, error) {
	if err := validateSortOrder(input.SortOrder); err != nil {
		return View{}, err
	}
	altText, err := normalizeAltText(input.AltText)
	if err != nil {
		return View{}, err
	}
	sortOrder, err := s.Repo.PrepareCreate(ctx, memberID, listingID, input.SortOrder)
	if err != nil {
		return View{}, err
	}
	imageID, err := randomUUID()
	if err != nil {
		return View{}, errStorage
	}
	path := objectPath(memberID, listingID, imageID, input.File.Extension)
	record := Record{
		ID: imageID, ListingID: listingID, StoragePath: path, AltText: altText, SortOrder: sortOrder,
	}
	if err = s.Storage.Upload(ctx, path, input.File.MIMEType, input.File.Bytes); err != nil {
		return View{}, errStorage
	}
	view, err := s.signRecord(ctx, record)
	if err != nil {
		s.cleanupNewObject(ctx, path, "create_sign")
		return View{}, err
	}
	if err = s.Repo.Insert(ctx, memberID, listingID, record); err != nil {
		s.cleanupNewObject(ctx, path, "create_db")
		return View{}, err
	}
	return view, nil
}

func (s *Service) Patch(ctx context.Context, memberID, listingID, imageID string, input PatchInput) (View, error) {
	if !input.AltTextSet && input.SortOrder == nil {
		return View{}, errInvalid
	}
	if err := validateSortOrder(input.SortOrder); err != nil {
		return View{}, err
	}
	var err error
	if input.AltTextSet {
		input.AltText, err = normalizeAltText(input.AltText)
		if err != nil {
			return View{}, err
		}
	}
	current, err := s.Repo.GetForMutation(ctx, memberID, listingID, imageID)
	if err != nil {
		return View{}, err
	}
	view, err := s.signRecord(ctx, current)
	if err != nil {
		return View{}, err
	}
	updated, err := s.Repo.Patch(ctx, memberID, listingID, imageID, input)
	if err != nil {
		return View{}, err
	}
	view.AltText = updated.AltText
	view.SortOrder = updated.SortOrder
	return view, nil
}

func (s *Service) Replace(ctx context.Context, memberID, listingID, imageID string, input ReplaceInput) (View, error) {
	var err error
	if input.AltTextSet {
		input.AltText, err = normalizeAltText(input.AltText)
		if err != nil {
			return View{}, err
		}
	}
	current, err := s.Repo.GetForMutation(ctx, memberID, listingID, imageID)
	if err != nil {
		return View{}, err
	}
	objectID, err := randomUUID()
	if err != nil {
		return View{}, errStorage
	}
	newPath := objectPath(memberID, listingID, objectID, input.File.Extension)
	if err = s.Storage.Upload(ctx, newPath, input.File.MIMEType, input.File.Bytes); err != nil {
		return View{}, errStorage
	}
	pending := current
	pending.StoragePath = newPath
	if input.AltTextSet {
		pending.AltText = input.AltText
	}
	view, err := s.signRecord(ctx, pending)
	if err != nil {
		s.cleanupNewObject(ctx, newPath, "replace_sign")
		return View{}, err
	}
	updated, err := s.Repo.Replace(ctx, memberID, listingID, imageID, current.StoragePath, newPath, input.AltTextSet, input.AltText)
	if err != nil {
		s.cleanupNewObject(ctx, newPath, "replace_db")
		return View{}, err
	}
	if deleteErr := s.Storage.Delete(ctx, current.StoragePath); deleteErr != nil && !errors.Is(deleteErr, errObjectNotFound) {
		s.logCleanup("replace_old_object")
	}
	view.AltText = updated.AltText
	view.SortOrder = updated.SortOrder
	return view, nil
}

func (s *Service) Delete(ctx context.Context, memberID, listingID, imageID string) error {
	current, err := s.Repo.GetForMutation(ctx, memberID, listingID, imageID)
	if err != nil {
		return err
	}
	if err = s.Storage.Delete(ctx, current.StoragePath); err != nil && !errors.Is(err, errObjectNotFound) {
		return errStorage
	}
	return s.Repo.Delete(ctx, memberID, listingID, imageID, current.StoragePath)
}

func (s *Service) signRecord(ctx context.Context, record Record) (View, error) {
	url, err := s.Storage.Sign(ctx, record.StoragePath, s.ttl())
	if errors.Is(err, errObjectNotFound) {
		reason := "not_found"
		return View{
			ID: record.ID, State: "unavailable", Reason: &reason,
			AltText: record.AltText, SortOrder: record.SortOrder,
		}, nil
	}
	if errors.Is(err, errSigningFailed) {
		reason := "signing_failed"
		return View{
			ID: record.ID, State: "unavailable", Reason: &reason,
			AltText: record.AltText, SortOrder: record.SortOrder,
		}, nil
	}
	if err != nil {
		return View{}, errStorage
	}
	now := s.now()
	expires := now.Add(s.ttl())
	return View{
		ID: record.ID, State: "signed", URL: &url, ExpiresAt: &expires,
		AltText: record.AltText, SortOrder: record.SortOrder,
	}, nil
}

func (s *Service) cleanupNewObject(ctx context.Context, path, operation string) {
	// A timed-out DB request must not cancel the compensating Storage deletion.
	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := s.Storage.Delete(cleanupCtx, path); err != nil && !errors.Is(err, errObjectNotFound) {
		s.logCleanup(operation)
	}
}

func (s *Service) logCleanup(operation string) {
	if s.Logger != nil {
		s.Logger.Warn("listing_image_cleanup_needed", "operation", operation)
	}
}

func (s *Service) ttl() time.Duration {
	if s.TTL <= 0 || s.TTL > 600*time.Second {
		return 600 * time.Second
	}
	return s.TTL
}

func (s *Service) now() time.Time {
	if s.Now != nil {
		return s.Now().UTC()
	}
	return time.Now().UTC()
}

func objectPath(memberID, listingID, objectID, extension string) string {
	return memberID + "/" + listingID + "/" + objectID + "." + extension
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
