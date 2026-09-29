'use client';

import {
  Heart,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Pencil,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { use, useEffect, useState } from 'react';

import { MobileShell } from '@/components/layout/MobileShell';
import { ListingImage } from '@/components/media/ListingImage';
import { startListingConversation } from '@/lib/chat/realtime';
import { storefrontFixtureImage, storefrontListingImages } from '@/lib/data/storefront-fixture-images';
import { SUMMER_CHAT_ROOMS } from '@/lib/data/summer-mock-data';
import { getGoSession } from '@/lib/go-auth/client';
import { getEditableGoListing, toMarketListing } from '@/lib/go-listings/client';
import { listGoListingImages } from '@/lib/go-listings/images';
import { listingAvailability, type ListingAvailability } from '@/lib/go-listings/reviews';
import { useFavorites } from '@/lib/listings/use-favorites';
import { toMockListing, useListings } from '@/lib/listings/use-listings';
import { triggerNativeHaptic } from '@/lib/native-bridge';

export default function ListingDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ source?: string }> }) {
  const { id } = use(params);
  const { source } = use(searchParams);
  const router = useRouter();
  const { listings, isLoading: isFeedLoading, error: feedError, retry } = useListings(source === 'demo' || source === 'local' ? 'demo' : 'server');
  const { favorites, updateFavorite, error: favoriteError } = useFavorites();
  const feedListing = listings.find((item) => item.id === id && (!source || (item.dataSource ?? (item.id.startsWith('local-listing-') ? 'local' : 'demo')) === source)) ?? null;
  const [goLookup, setGoLookup] = useState<{
    id: string;
    listing: ReturnType<typeof toMockListing>;
    status: string | null;
  } | null>(null);
  const goListing = (source === 'go' || !source) && goLookup?.id === id ? goLookup.listing : null;
  const baseListing = feedListing ?? goListing;
  const goReviewStatus = goLookup?.id === id ? goLookup.status : null;
  const usesGoImages = baseListing?.dataSource === 'go';
  const [imageLookup, setImageLookup] = useState<{ id: string; images: string[] } | null>(null);
  const listing =
    baseListing && usesGoImages && imageLookup?.id === id
      ? { ...baseListing, images: storefrontListingImages(baseListing, imageLookup.images) }
      : baseListing;
  const isLoading = isFeedLoading || (!feedListing && (source === 'go' || !source) && goLookup?.id !== id);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [actionMessage, setActionMessage] = useState('');
  const [isOpeningChat, setIsOpeningChat] = useState(false);
  const [currentMemberId, setCurrentMemberId] = useState<string | null>(null);
  const [imageError, setImageError] = useState('');
  const [imageNeedsLogin, setImageNeedsLogin] = useState(false);
  const [imageRefresh, setImageRefresh] = useState(0);
  const [availability, setAvailability] = useState<{ id: string; value: ListingAvailability | null; error: string } | null>(null);
  useEffect(() => {
    if (!usesGoImages || goReviewStatus !== 'active') return;
    let active = true;
    void listingAvailability(id).then((result) => {
      if (active) setAvailability({ id, value: result.ok ? result.data : null, error: result.ok ? '' : result.message });
    });
    return () => { active = false; };
  }, [id, usesGoImages, goReviewStatus]);

  useEffect(() => {
    let active = true;
    void getGoSession().then((result) => {
      if (active && result.ok) setCurrentMemberId(result.session.member.id);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!usesGoImages) return;
    let active = true;
    let expiryTimer: ReturnType<typeof setTimeout> | undefined;
    void listGoListingImages(id).then((result) => {
      if (!active) return;
      if (!result.ok) {
        setImageError(result.message);
        setImageNeedsLogin(result.status === 401);
        return;
      }
      setImageError('');
      setImageNeedsLogin(false);
      setImageLookup({ id, images: result.data.map((image) => image.url) });
      setActiveImageIndex(0);
      const expiresAt = Math.min(...result.data.map((image) => Date.parse(image.expiresAt)));
      if (Number.isFinite(expiresAt) && expiresAt > Date.now()) {
        expiryTimer = setTimeout(() => setImageRefresh((value) => value + 1), expiresAt - Date.now());
      }
    });
    return () => {
      active = false;
      clearTimeout(expiryTimer);
    };
  }, [id, imageRefresh, usesGoImages]);

  useEffect(() => {
    if ((source && source !== 'go') || (feedListing && feedListing.dataSource !== 'go')) return;
    let active = true;
    void getEditableGoListing(id).then((item) => {
      if (!active) return;
      const mapped = item ? toMarketListing(item) : null;
      setGoLookup({ id, listing: mapped ? toMockListing(mapped, 'go') : null, status: item?.status ?? null });
    });
    return () => {
      active = false;
    };
  }, [feedListing, id, source]);

  if (!listing && isLoading) {
    return (
      <MobileShell storefront title="장비 불러오는 중" showBack hideNav>
        <div className="empty-state">
          <LoaderCircle className="spin" size={28} />
          <p>매물 정보를 확인하고 있어요.</p>
        </div>
      </MobileShell>
    );
  }

  if (!listing) {
    return (
      <MobileShell storefront title="장비를 찾을 수 없어요" showBack hideNav>
        <div className="empty-state">
          <p>{feedError && source !== 'demo' && source !== 'local' ? feedError : '판매가 종료됐거나 존재하지 않는 매물이에요.'}</p>
          {feedError ? <button className="btn-outline" type="button" onClick={retry}>다시 시도</button> : null}
          <Link className="btn-primary" href="/market">마켓으로 돌아가기</Link>
        </div>
      </MobileShell>
    );
  }

  const favoriteId = listing.dataSource === 'go' ? `go:${listing.id}` : listing.id;
  const isFavorite = favorites[favoriteId] ?? false;
  const activeImage = listing.images[activeImageIndex] ?? listing.images[0];
  const isFixtureImage = Boolean(activeImage && activeImage === storefrontFixtureImage(listing));

  const shareListing = async () => {
    const shareData = {
      title: listing.title,
      text: `${listing.title} · ${listing.price.toLocaleString()}원`,
      url: window.location.href,
    };
    const nativeShare = (navigator as Navigator & { share?: (data: ShareData) => Promise<void> })
      .share;
    try {
      if (typeof nativeShare === 'function') await nativeShare.call(navigator, shareData);
      else await navigator.clipboard.writeText(window.location.href);
      setActionMessage(
        typeof nativeShare === 'function' ? '공유 화면을 열었어요.' : '링크를 복사했어요.',
      );
      triggerNativeHaptic('success');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setActionMessage('링크를 공유하지 못했어요.');
      triggerNativeHaptic('error');
    }
  };

  const openChat = async () => {
    setActionMessage('');
    const demoRoom = listing.dataSource === 'go' ? null : SUMMER_CHAT_ROOMS.find((room) => room.listingId === listing.id);
    if (demoRoom) {
      router.push(`/chat/${demoRoom.id}`);
      return;
    }
    if (listing.dataSource !== 'go' && !listing.sellerId) {
      router.push('/auth');
      return;
    }

    setIsOpeningChat(true);
    const result = await startListingConversation(listing.id);
    setIsOpeningChat(false);
    if (result.ok) {
      router.push(`/chat/${result.conversationId}`);
      return;
    }
    if (result.reason === 'unauthenticated') {
      router.push('/auth');
      return;
    }
    setActionMessage(result.message);
    triggerNativeHaptic('error');
  };

  return (
    <MobileShell storefront hideNav showBack>
      <div className="detail-container">
        <div className="detail-gallery" style={isFixtureImage ? { background: 'var(--surface-subtle)' } : undefined}>
            <ListingImage
              key={`${activeImage}-${imageRefresh}`}
              alt={listing.title}
              fill
              priority
              sizes="(max-width: 480px) 100vw, 480px"
              src={activeImage}
              style={isFixtureImage ? { objectFit: 'contain' } : undefined}
              onError={() => {
                if (usesGoImages) {
                  setImageError('사진 링크가 만료되었거나 불러올 수 없어요. 사진을 갱신해 주세요.');
                  setImageNeedsLogin(false);
                }
              }}
              unoptimized
            />
          {listing.images.length > 1 ? (
            <span className="gallery-count">
              {activeImageIndex + 1} / {listing.images.length}
            </span>
          ) : null}
        </div>
        {usesGoImages && imageError ? (
          <div className="image-load-error" role="alert">
            <p>{imageError}</p>
            <button className="btn-outline" type="button" onClick={() => setImageRefresh((value) => value + 1)}>사진 갱신</button>
            {imageNeedsLogin ? <a href="/auth" target="_blank" rel="noreferrer">다시 로그인</a> : null}
          </div>
        ) : null}

        {listing.images.length > 1 ? (
          <div className="thumbnail-strip" aria-label="상품 사진 선택">
            {listing.images.map((image, index) => (
              <button
                aria-label={`${index + 1}번째 사진 보기`}
                aria-pressed={activeImageIndex === index}
                className={activeImageIndex === index ? 'active' : ''}
                key={image}
                onClick={() => setActiveImageIndex(index)}
                type="button"
              >
                <ListingImage alt="" fill sizes="56px" src={image} unoptimized />
              </button>
            ))}
          </div>
        ) : null}

        <div className="detail-body">
          {isFixtureImage ? (
            <p className="demo-mode-banner">상품 이해를 위한 예시 사진입니다.</p>
          ) : (
            <p className="demo-mode-banner">{listing.dataSource === 'go' ? '실제 등록 상품 · 구매 가능 여부는 주문 단계에서 확인합니다.' : listing.dataSource === 'supabase' ? '기존 등록 상품 · 현재 구매 흐름과 연결되지 않은 상품입니다.' : '시연용 상품 · 실제 구매 가능한 재고가 아닙니다.'}</p>
          )}
          {listing.recommendationReason ? (
            <div className="rec-reason-badge detail-recommendation">
              <Sparkles size={13} />
              <span>{listing.recommendationReason}</span>
            </div>
          ) : null}
          <div className="detail-meta">
            <strong>{listing.sportLabel}</strong>
            <span>·</span>
            <span>{listing.conditionLabel}</span>
            <span>·</span>
            <span>{listing.createdAt}</span>
          </div>
          <h1>{listing.title}</h1>
          <div className="detail-price">{listing.price.toLocaleString()}원</div>

          <section className="detail-seller-card">
            <Image
              alt={listing.seller.name}
              height={46}
              src={listing.seller.avatar}
              unoptimized
              width={46}
            />
            <div>
              <strong>{listing.seller.name}</strong>
              <span>
                {!listing.dataSource ? null : <Star fill="#f59e0b" size={12} />}
                {!listing.dataSource ? '시연용 판매자 정보' : listing.seller.rating + ' · 거래 ' + listing.seller.transactionCount + '회'}
              </span>
            </div>
            <p>
              {!listing.dataSource ? null : <ShieldCheck size={16} />}
              {!listing.dataSource ? '판매자 정보' : '본인인증'}
            </p>
          </section>

          <section className="detail-section">
            <h2>{listing.sportLabel} 장비 스펙</h2>
            <div className="spec-grid">
              {Object.entries(listing.specs).map(([key, value]) => (
                <div className="spec-item" key={key}>
                  <span className="spec-label">{key}</span>
                  <span className="spec-val">{value}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="detail-section">
            <h2>상품 설명</h2>
            <p className="detail-description">{listing.description}</p>
          </section>
          <div className="detail-location">
            <MapPin size={16} />
            <span>
              희망 거래 장소 <strong>{listing.location}</strong>
            </span>
          </div>
          <div className="detail-share-actions">
            <button className="detail-share" onClick={() => void shareListing()} type="button">
              <Share2 size={16} />이 매물 공유하기
            </button>
            {currentMemberId && listing.sellerId === currentMemberId ? (
              <Link className="detail-share" href={`/market/${listing.id}/edit`}>
                <Pencil size={16} />내 매물 수정하기
              </Link>
            ) : null}
          </div>
          {favoriteError ? <p className="form-error" role="alert">{favoriteError}</p> : null}
          {actionMessage ? (
            <p className="form-error detail-action-message" role="status">
              {actionMessage}
            </p>
          ) : null}
        </div>

        <div className="sticky-bottom-action">
          {usesGoImages ? (
            <>
              <button
                aria-label={isFavorite ? '찜 해제' : '찜하기'}
                aria-pressed={isFavorite}
                className="btn-outline detail-favorite"
                onClick={() => updateFavorite(favoriteId, !isFavorite)}
                type="button"
              >
                <Heart
                  color={isFavorite ? 'var(--danger)' : 'currentColor'}
                  fill={isFavorite ? 'var(--danger)' : 'none'}
                  size={20}
                />
              </button>
              {listing.sellerId !== currentMemberId ? <button className="btn-outline" type="button" disabled={isOpeningChat} onClick={() => void openChat()}><MessageCircle size={18} />{isOpeningChat ? '연결 중' : '판매자 문의'}</button> : null}
              {goReviewStatus === 'active' && availability?.id === id && availability.value?.purchasable ? (
                <Link href={`/order/new/${listing.id}`} className="btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>구매하기</Link>
              ) : (
                <div role="status" style={{ flex: 1 }}>
                  {goReviewStatus && goReviewStatus !== 'active' ? '공개 전 매물이에요.'
                    : goLookup?.id === id && !goReviewStatus ? '매물 상태를 확인할 수 없어요.'
                      : availability?.id !== id ? '구매 가능 여부 확인 중' : availability.error || ({
                        not_public: '공개 전 매물이에요.', not_prepared: '판매 준비 중이에요.', sold_out: '재고가 없어요.', available: '',
                      }[availability.value?.reason ?? 'not_prepared'])}
                </div>
              )}
            </>
          ) : (
            <button
              className="btn-primary"
              disabled={isOpeningChat}
              onClick={() => void openChat()}
              type="button"
            >
              {isOpeningChat ? (
                <LoaderCircle className="spin" size={18} />
              ) : (
                <MessageCircle size={18} />
              )}
              <span>
                {listing.sellerId || SUMMER_CHAT_ROOMS.some((room) => room.listingId === listing.id)
                  ? '채팅으로 거래하기'
                  : '로그인하고 문의하기'}
              </span>
            </button>
          )}
        </div>
      </div>
    </MobileShell>
  );
}
