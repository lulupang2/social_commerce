package orders

import (
	"context"
	"errors"
	"testing"
)

func TestFakePGTracksAuthoritativeState(t *testing.T) {
	ctx := context.Background()
	pg := NewFakePG()
	id := "11111111-1111-4111-8111-111111111111"
	key := "fake-pay-" + id
	if _, err := pg.Lookup(ctx, "", key); !errors.Is(err, ErrPGUnknown) {
		t.Fatal("unknown key must not appear approved")
	}
	first, err := pg.Approve(ctx, "", id, 12000, key)
	if err != nil {
		t.Fatal(err)
	}
	repeat, err := pg.Approve(ctx, "", id, 12000, key)
	if err != nil || *first != *repeat {
		t.Fatal("approval not idempotent")
	}
	if _, err = pg.Approve(ctx, "", id, 12001, key); !errors.Is(err, ErrConflict) {
		t.Fatal("accepted changed amount")
	}
	if _, err = pg.Approve(ctx, "", id, 12000, "forged"); !errors.Is(err, ErrInvalid) {
		t.Fatal("accepted forged key")
	}
	state, err := pg.Cancel(ctx, "", key)
	if err != nil || state.Status != "cancelled" {
		t.Fatal("cancel failed")
	}
	state, err = pg.Lookup(ctx, "", key)
	if err != nil || state.Status != "cancelled" {
		t.Fatal("lookup reverted cancel")
	}
	state, err = pg.Approve(ctx, "", id, 12000, key)
	if err != nil || state.Status != "cancelled" {
		t.Fatal("duplicate approval resurrected cancel")
	}
}
func TestHostedTargetCannotUseFakeApproval(t *testing.T) {
	pg := NewGateway(nil, false)
	if _, err := pg.Approve(context.Background(), "", "", 1, ""); !errors.Is(err, ErrPGUnavailable) {
		t.Fatal("hosted target used fake approval")
	}
}
