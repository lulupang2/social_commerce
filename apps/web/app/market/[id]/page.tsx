'use client';

import {
  Heart,
  LoaderCircle,
  MapPin,
  MessageCircle,
  Share2,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import React, { use, useState } from 'react';

import { MobileShell } from '@/components/layout/MobileShell';
import { startListingConversation } from '@/lib/chat/realtime';
import { SUMMER_CHAT_ROOMS } from '@/lib/data/summer-mock-data';
import { useFavorites } from '@/lib/listings/use-favorites';
import { useListings } from '@/lib/listings/use-listings';
import { triggerNativeHaptic } from '@/lib/native-bridge';

export default function ListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { listings, isLoading } = useListings();
  const { favorites, updateFavorite } = useFavorites();
  const listing = listings.find((item) => item.id === id) ?? null;
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [actionMessage, setActionMessage] = useState('');
  const [isOpeningChat, setIsOpeningChat] = useState(false);

  if (!listing && isLoading) {
    return (
      <MobileShell title="장비 불러오는 중" showBack hideNav>
        <div className="empty-state">
          <LoaderCircle className="spin" size={28} />
          <p>매물 정보를 확인하고 있어요.</p>
        </div>
      </MobileShell>
    );
  }

  if (!listing) {
    return (
      <MobileShell title="장비를 찾을 수 없어요" showBack hideNav>
        <div className="empty-state">
          <p>판매가 종료됐거나 존재하지 않는 매물이에요.</p>
          <Link className="btn-primary" href="/market">
            마켓으로 돌아가기
          </Link>
        </div>
      </MobileShell>
    );
  }

  const isFavorite = favorites[listing.id] ?? false;
  const activeImage = listing.images[activeImageIndex] ?? listing.images[0];

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
    const demoRoom = SUMMER_CHAT_ROOMS.find((room) => room.listingId === listing.id);
    if (demoRoom) {
      router.push(`/chat/${demoRoom.id}`);
      return;
    }
    if (!listing.sellerId) {
      router.push('/auth');
      return;
    }

    setIsOpeningChat(true);
    const result = await startListingConversation(listing.id, listing.sellerId);
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
    <MobileShell hideNav showBack>
      <div className="detail-container">
        <div className="detail-gallery">
          <Image
            alt={listing.title}
            fill
            priority
            sizes="(max-width: 480px) 100vw, 480px"
            src={activeImage}
            unoptimized
          />
          {listing.images.length > 1 ? (
            <span className="gallery-count">
              {activeImageIndex + 1} / {listing.images.length}
            </span>
          ) : null}
        </div>

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
                <Image alt="" fill sizes="56px" src={image} unoptimized />
              </button>
            ))}
          </div>
        ) : null}

        <div className="detail-body">
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
                <Star fill="#f59e0b" size={12} />
                {listing.seller.rating} · 거래 {listing.seller.transactionCount}회
              </span>
            </div>
            <p>
              <ShieldCheck size={16} />
              본인인증
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
          <button className="detail-share" onClick={() => void shareListing()} type="button">
            <Share2 size={16} />이 매물 공유하기
          </button>
          {actionMessage ? (
            <p className="form-error detail-action-message" role="status">
              {actionMessage}
            </p>
          ) : null}
        </div>

        <div className="sticky-bottom-action">
          <button
            aria-label={isFavorite ? '찜 해제' : '찜하기'}
            aria-pressed={isFavorite}
            className="btn-outline detail-favorite"
            onClick={() => updateFavorite(listing.id, !isFavorite)}
            type="button"
          >
            <Heart
              color={isFavorite ? 'var(--danger)' : 'currentColor'}
              fill={isFavorite ? 'var(--danger)' : 'none'}
              size={20}
            />
          </button>
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
        </div>
      </div>
    </MobileShell>
  );
}
