package listings

import (
	"encoding/json"
	"math"
	"strings"
	"time"
)

const Prefix = "/api/v1/listings"

type Failure struct {
	Status  int
	Code    string
	Message string
}

func (e *Failure) Error() string { return e.Code }

var (
	errInvalid  = &Failure{400, "LISTING_INVALID", "Listing information is invalid"}
	errNotFound = &Failure{404, "LISTING_NOT_FOUND", "Listing was not found"}
	errDB       = &Failure{503, "LISTING_DATABASE_UNAVAILABLE", "Listing storage is unavailable"}
)

type Seller struct {
	ID          string  `json:"id"`
	DisplayName *string `json:"displayName"`
}

type Listing struct {
	ID          string         `json:"id"`
	Seller      Seller         `json:"seller"`
	Sport       string         `json:"sport"`
	Category    string         `json:"category"`
	Title       string         `json:"title"`
	Description string         `json:"description"`
	PriceKRW    int64          `json:"priceKrw"`
	Condition   string         `json:"condition"`
	Status      string         `json:"status"`
	Details     map[string]any `json:"details"`
	Location    string         `json:"location"`
	PublishedAt *time.Time     `json:"publishedAt"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
}

type CreateInput struct {
	Sport       string         `json:"sport"`
	Category    string         `json:"category"`
	Title       string         `json:"title"`
	Description string         `json:"description"`
	PriceKRW    int64          `json:"priceKrw"`
	Condition   string         `json:"condition"`
	Details     map[string]any `json:"details"`
	Location    string         `json:"location"`
}

type UpdateInput struct {
	Category    *string         `json:"category"`
	Title       *string         `json:"title"`
	Description *string         `json:"description"`
	PriceKRW    *int64          `json:"priceKrw"`
	Condition   *string         `json:"condition"`
	Details     *map[string]any `json:"details"`
	Location    *string         `json:"location"`
}

type Filters struct {
	Sport    string
	Category string
	Search   string
}

func normalizeCreate(input CreateInput) CreateInput {
	input.Sport = strings.TrimSpace(input.Sport)
	input.Category = strings.TrimSpace(input.Category)
	input.Title = strings.TrimSpace(input.Title)
	input.Description = strings.TrimSpace(input.Description)
	input.Condition = strings.TrimSpace(input.Condition)
	input.Location = strings.TrimSpace(input.Location)
	return input
}

func normalizeUpdate(input UpdateInput) UpdateInput {
	trim := func(value **string) {
		if *value != nil {
			v := strings.TrimSpace(**value)
			*value = &v
		}
	}
	trim(&input.Category)
	trim(&input.Title)
	trim(&input.Description)
	trim(&input.Condition)
	trim(&input.Location)
	return input
}

func validateCreate(input CreateInput) error {
	if !oneOf(input.Sport, "surf", "tennis") || !validCategory(input.Category) ||
		!validText(input.Title, 1, 120) || !validText(input.Description, 10, 5000) ||
		input.PriceKRW < 0 || input.PriceKRW > 999999999999 ||
		!oneOf(input.Condition, "new", "like_new", "good", "fair", "poor") ||
		!validText(input.Location, 1, 160) {
		return errInvalid
	}
	return validateDetails(input.Sport, input.Details)
}

func validateUpdate(input UpdateInput) error {
	if input.Category == nil && input.Title == nil && input.Description == nil && input.PriceKRW == nil &&
		input.Condition == nil && input.Details == nil && input.Location == nil {
		return errInvalid
	}
	if input.Category != nil && !validCategory(*input.Category) {
		return errInvalid
	}
	if input.Title != nil && !validText(*input.Title, 1, 120) {
		return errInvalid
	}
	if input.Description != nil && !validText(*input.Description, 10, 5000) {
		return errInvalid
	}
	if input.PriceKRW != nil && (*input.PriceKRW < 0 || *input.PriceKRW > 999999999999) {
		return errInvalid
	}
	if input.Condition != nil && !oneOf(*input.Condition, "new", "like_new", "good", "fair", "poor") {
		return errInvalid
	}
	if input.Location != nil && !validText(*input.Location, 1, 160) {
		return errInvalid
	}
	if input.Details != nil {
		sport, ok := (*input.Details)["sport"].(string)
		if !ok || !oneOf(sport, "surf", "tennis") || validateDetails(sport, *input.Details) != nil {
			return errInvalid
		}
	}
	return nil
}

func validateDetails(sport string, details map[string]any) error {
	if details == nil || details["sport"] != sport {
		return errInvalid
	}
	allowed := surfDetailKeys
	if sport == "tennis" {
		allowed = tennisDetailKeys
	}
	for key, value := range details {
		if !allowed[key] {
			return errInvalid
		}
		switch key {
		case "sport":
			if value != sport {
				return errInvalid
			}
		case "brand", "model":
			if !validJSONText(value, 1, 120) {
				return errInvalid
			}
		case "notes":
			if !validJSONText(value, 1, 1000) {
				return errInvalid
			}
		case "size":
			if !validJSONText(value, 1, 40) {
				return errInvalid
			}
		case "gender":
			if !jsonEnum(value, "men", "women", "unisex", "youth") {
				return errInvalid
			}
		case "skillLevel":
			if !jsonEnum(value, "beginner", "intermediate", "advanced", "expert") {
				return errInvalid
			}
		case "year":
			if !jsonNumber(value, 1900, 2200, true) {
				return errInvalid
			}
		case "equipmentType":
			if sport == "surf" && !jsonEnum(value, "surfboard", "wetsuit", "fins", "leash", "boardbag", "wax_accessories", "other") {
				return errInvalid
			}
			if sport == "tennis" && !jsonEnum(value, "racket", "bag", "shoes", "apparel", "balls", "strings_grips", "other") {
				return errInvalid
			}
		case "discipline":
			if !jsonEnum(value, "shortboard", "longboard", "funboard", "fish", "sup", "bodyboard", "foil", "other") {
				return errInvalid
			}
		case "boardLengthFeet":
			if !jsonNumber(value, 0, 20, false) {
				return errInvalid
			}
		case "boardLengthCm":
			if !jsonNumber(value, 0, 600, false) {
				return errInvalid
			}
		case "volumeLiters":
			if !jsonNumber(value, 0, 300, false) {
				return errInvalid
			}
		case "finSystem":
			if !jsonEnum(value, "fcs", "fcs2", "futures", "single_box", "other") {
				return errInvalid
			}
		case "finIncluded", "strung":
			if _, ok := value.(bool); !ok {
				return errInvalid
			}
		case "wetsuitThickness":
			if !jsonEnum(value, "2mm", "3_2mm", "4_3mm", "5_4mm", "other") {
				return errInvalid
			}
		case "playStyle":
			if !jsonEnum(value, "baseline_aggressive", "all_court", "serve_volley", "recreational", "other") {
				return errInvalid
			}
		case "handedness":
			if !jsonEnum(value, "left", "right") {
				return errInvalid
			}
		case "headSizeSqIn":
			if !jsonNumber(value, 0, 150, false) {
				return errInvalid
			}
		case "weightGrams":
			if !jsonNumber(value, 0, 600, false) {
				return errInvalid
			}
		case "gripSize", "stringPattern":
			if !validJSONText(value, 1, 20) {
				return errInvalid
			}
		}
	}
	data, err := json.Marshal(details)
	if err != nil || len(data) > 8192 {
		return errInvalid
	}
	return nil
}

var surfDetailKeys = map[string]bool{
	"sport": true, "brand": true, "model": true, "year": true, "size": true, "gender": true,
	"skillLevel": true, "notes": true, "equipmentType": true, "discipline": true,
	"boardLengthFeet": true, "boardLengthCm": true, "volumeLiters": true, "finSystem": true,
	"finIncluded": true, "wetsuitThickness": true,
}
var tennisDetailKeys = map[string]bool{
	"sport": true, "brand": true, "model": true, "year": true, "size": true, "gender": true,
	"skillLevel": true, "notes": true, "equipmentType": true, "playStyle": true,
	"handedness": true, "headSizeSqIn": true, "weightGrams": true, "gripSize": true,
	"stringPattern": true, "strung": true,
}

func validCategory(value string) bool {
	return oneOf(value, "equipment", "apparel", "footwear", "protective", "accessories", "other")
}
func validText(value string, min, max int) bool {
	n := len([]rune(strings.TrimSpace(value)))
	return n >= min && n <= max
}
func validJSONText(value any, min, max int) bool {
	v, ok := value.(string)
	return ok && validText(v, min, max)
}
func jsonEnum(value any, allowed ...string) bool {
	v, ok := value.(string)
	return ok && oneOf(v, allowed...)
}
func jsonNumber(value any, min, max float64, integer bool) bool {
	v, ok := value.(float64)
	return ok && !math.IsNaN(v) && !math.IsInf(v, 0) && v > min && v <= max && (!integer || math.Trunc(v) == v)
}
func oneOf(value string, allowed ...string) bool {
	for _, candidate := range allowed {
		if value == candidate {
			return true
		}
	}
	return false
}
