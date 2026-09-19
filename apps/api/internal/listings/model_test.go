package listings

import "testing"

func validCreateInput() CreateInput {
	return CreateInput{
		Sport:       "surf",
		Category:    "equipment",
		Title:       "Happy Everyday 5'11",
		Description: "상태가 좋고 수리 이력이 없는 테스트 매물입니다.",
		PriceKRW:    250000,
		Condition:   "good",
		Location:    "양양 죽도",
		Details: map[string]any{
			"sport":           "surf",
			"equipmentType":   "surfboard",
			"discipline":      "shortboard",
			"boardLengthFeet": 5.11,
			"volumeLiters":    32.5,
			"finSystem":       "fcs2",
		},
	}
}

func TestValidateCreate(t *testing.T) {
	input := validCreateInput()
	if err := validateCreate(input); err != nil {
		t.Fatal(err)
	}

	input.Details["unexpected"] = "value"
	if err := validateCreate(input); err == nil {
		t.Fatal("unknown detail key accepted")
	}
	delete(input.Details, "unexpected")

	input.Details["sport"] = "tennis"
	if err := validateCreate(input); err == nil {
		t.Fatal("mismatched detail sport accepted")
	}
	input.Details["sport"] = "surf"

	input.PriceKRW = -1
	if err := validateCreate(input); err == nil {
		t.Fatal("negative price accepted")
	}
}

func TestValidateUpdate(t *testing.T) {
	if err := validateUpdate(UpdateInput{}); err == nil {
		t.Fatal("empty patch accepted")
	}

	title := "  수정한 매물 제목  "
	input := normalizeUpdate(UpdateInput{Title: &title})
	if input.Title == nil || *input.Title != "수정한 매물 제목" {
		t.Fatal("patch text was not normalized")
	}
	if err := validateUpdate(input); err != nil {
		t.Fatal(err)
	}

	badDetails := map[string]any{"sport": "surf", "weightGrams": 300.0}
	if err := validateUpdate(UpdateInput{Details: &badDetails}); err == nil {
		t.Fatal("cross-sport detail accepted")
	}
}
