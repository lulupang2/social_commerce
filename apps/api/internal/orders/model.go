package orders

import "time"

// Failure represents a typed API error response.
type Failure struct {
	Status  int
	Code    string
	Message string
}

func (e *Failure) Error() string { return e.Code }

// Exported errors for use by other packages.
var (
	ErrInvalid           = &Failure{400, "ORDER_INVALID", "Order input is invalid"}
	ErrNotFound          = &Failure{404, "ORDER_NOT_FOUND", "Order was not found"}
	ErrDatabase          = &Failure{503, "ORDER_DATABASE_UNAVAILABLE", "Order storage is unavailable"}
	ErrInsufficientStock = &Failure{409, "INSUFFICIENT_STOCK", "Listing has insufficient inventory"}
	ErrSelfPurchase      = &Failure{403, "SELF_PURCHASE", "Cannot buy your own listing"}
	ErrPaymentFailed     = &Failure{402, "PAYMENT_FAILED", "Payment could not be approved"}
	ErrConflict          = &Failure{409, "ORDER_CONFLICT", "Order already exists or is being processed"}
	ErrUnauthorized      = &Failure{401, "UNAUTHORIZED", "Authentication required"}
	ErrForbidden         = &Failure{403, "FORBIDDEN", "Access denied"}
)

// SellerType classifies a seller as individual or business.
type SellerType string

const (
	SellerTypeIndividual SellerType = "individual"
	SellerTypeBusiness   SellerType = "business"
)

// Seller is the selling entity.
type Seller struct {
	ID          string     `json:"id"`
	Type        SellerType `json:"type"`
	DisplayName string     `json:"displayName"`
	Status      string     `json:"status"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

// Membership links a member to a seller.
type Membership struct {
	SellerID string    `json:"-"`
	MemberID string    `json:"-"`
	IsOwner  bool      `json:"isOwner"`
	Active   bool      `json:"active"`
	JoinedAt time.Time `json:"joinedAt"`
}

// Listing is a minimal view of a listing needed for order creation.
type Listing struct {
	ID             string `json:"id"`
	SellerMemberID string `json:"-"`
	Title          string `json:"title"`
	PriceKRW       int64  `json:"priceKrw"`
	Sport          string `json:"sport"`
	Category       string `json:"category"`
	Seller         Seller `json:"seller"`
}

// Order represents an order with its snapshot data.
type Order struct {
	ID                string       `json:"id"`
	BuyerID           string       `json:"buyerId"`
	SellerID          string       `json:"sellerId"`
	ListingID         string       `json:"listingId"`
	ItemName          string       `json:"itemName"`
	UnitPriceKRW      int64        `json:"unitPriceKrw"`
	Quantity          int          `json:"quantity"`
	ShippingFeeKRW    int          `json:"shippingFeeKrw"`
	ServiceFeeKRW     int          `json:"serviceFeeKrw"`
	TotalAmountKRW    int64        `json:"totalAmountKrw"`
	Currency          string       `json:"currency"`
	Status            string       `json:"status"`
	PaymentStatus     string       `json:"paymentStatus"`
	FulfillmentStatus string       `json:"fulfillmentStatus"`
	AcceptedAt        *time.Time   `json:"acceptedAt"`
	HandedOverAt      *time.Time   `json:"handedOverAt"`
	ReceivedAt        *time.Time   `json:"receivedAt"`
	Items             []*OrderItem `json:"items,omitempty"`
	Reservation       *Reservation `json:"reservation,omitempty"`
	CreatedAt         time.Time    `json:"createdAt"`
	UpdatedAt         time.Time    `json:"updatedAt"`
}

// FulfillmentEvent records a participant-authorized handover transition.
type FulfillmentEvent struct {
	ID            int64     `json:"id"`
	ActorMemberID string    `json:"actorMemberId"`
	FromStatus    string    `json:"fromStatus"`
	ToStatus      string    `json:"toStatus"`
	CreatedAt     time.Time `json:"createdAt"`
}

// OrderItem is a price snapshot within an order.
type OrderItem struct {
	ID           string    `json:"id"`
	OrderID      string    `json:"-"`
	ListingID    string    `json:"listingId"`
	ItemName     string    `json:"itemName"`
	UnitPriceKRW int64     `json:"unitPriceKrw"`
	Quantity     int       `json:"quantity"`
	LineTotalKRW int64     `json:"lineTotalKrw"`
	CreatedAt    time.Time `json:"createdAt"`
}

// Reservation tracks inventory reservation with timeout.
type Reservation struct {
	ID        string    `json:"id"`
	ListingID string    `json:"listingId"`
	OrderID   string    `json:"orderId"`
	BuyerID   string    `json:"-"`
	Quantity  int       `json:"quantity"`
	ExpiresAt time.Time `json:"expiresAt"`
	State     string    `json:"state"`
	CreatedAt time.Time `json:"-"`
}

// InventoryItem tracks available/reserved stock.
type InventoryItem struct {
	ID                string `json:"id"`
	ListingID         string `json:"listingId"`
	AvailableQuantity int    `json:"availableQuantity"`
	ReservedQuantity  int    `json:"reservedQuantity"`
}

// PaymentAttempt records a payment attempt on an order.
type PaymentAttempt struct {
	ID              string    `json:"id"`
	OrderID         string    `json:"orderId"`
	PGProvider      string    `json:"pgProvider"`
	PGPaymentKey    string    `json:"pgPaymentKey,omitempty"`
	PGTransactionID string    `json:"pgTransactionId,omitempty"`
	RequestedAmount int64     `json:"requestedAmount"`
	ApprovedAmount  *int64    `json:"approvedAmount,omitempty"`
	Currency        string    `json:"currency"`
	Status          string    `json:"status"` // pending, approved, failed, unknown
	IdempotencyKey  string    `json:"idempotencyKey"`
	ResultDetails   any       `json:"resultDetails,omitempty"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

// PGEvent represents a webhook event from the payment gateway.
type PGEvent struct {
	PGEventID  string
	EventType  string
	RawPayload any
	OrderID    string
	PaymentKey string
	Amount     int64
}

// PaymentState is the current state as reported by the PG.
type PaymentState struct {
	Provider    string
	OrderID     string
	PaymentKey  string
	Status      string // "approved", "failed", "cancelled"
	Amount      int64
	ConfirmedAt time.Time
}
