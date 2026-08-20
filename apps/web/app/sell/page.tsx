'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { MobileShell } from '@/components/layout/MobileShell';
import { Camera, CheckCircle2, ChevronRight, Waves, Trophy, ArrowRight } from 'lucide-react';

export default function SellPage() {
  const router = useRouter();
  const [step, setStep] = useState<number>(1);
  const [sport, setSport] = useState<'surf' | 'tennis'>('surf');
  const [formData, setFormData] = useState({
    title: '',
    category: 'equipment',
    brand: '',
    model: '',
    condition: 'like_new',
    price: '',
    location: '',
    description: '',
    // Surf specific
    surfDiscipline: 'shortboard',
    boardLengthFeet: '5.11',
    volumeLiters: '32.5',
    finSystem: 'fcs2',
    // Tennis specific
    headSizeSqIn: '100',
    weightGrams: '300',
    gripSize: '2',
    playStyle: 'all_court',
  });

  const [submitted, setSubmitted] = useState(false);

  const handleNext = () => {
    if (step < 3) {
      setStep(step + 1);
    } else {
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <MobileShell title="판매 등록 완료" hideNav>
        <div style={{ padding: '60px 24px', textAlign: 'center' }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: 'var(--primary-light)',
              color: 'var(--primary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 20px',
            }}
          >
            <CheckCircle2 size={44} />
          </div>

          <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: 8 }}>
            장비 등록이 완료되었습니다!
          </h2>
          <p
            style={{
              fontSize: '0.9rem',
              color: 'var(--text-muted)',
              lineHeight: 1.5,
              marginBottom: 30,
            }}
          >
            검토 후 신뢰도 높은 구매자들에게 우선 노출됩니다.
            <br />
            {sport === 'surf' ? '🏄‍♂️ 서핑' : '🎾 테니스'} 마켓 피드에서 확인하실 수 있습니다.
          </p>

          <button
            onClick={() => router.push('/market')}
            className="btn-primary"
            style={{ maxWidth: 300, margin: '0 auto' }}
          >
            마켓 피드로 이동
          </button>
        </div>
      </MobileShell>
    );
  }

  return (
    <MobileShell title="내 장비 판매하기" showBack hideNav>
      <div style={{ padding: '16px 16px 90px' }}>
        {/* Progress Bar */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                flex: 1,
                height: 4,
                borderRadius: 2,
                background: s <= step ? 'var(--primary)' : 'var(--border)',
                transition: 'background 0.2s',
              }}
            />
          ))}
        </div>

        {/* Step 1: Sport Selection */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 6 }}>
              어떤 하계 스포츠 장비인가요?
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 20 }}>
              종목에 딱 맞는 상세 스펙 입력을 지원해 드립니다.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div
                onClick={() => setSport('surf')}
                style={{
                  padding: '18px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: sport === 'surf' ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: sport === 'surf' ? 'var(--primary-light)' : 'var(--surface)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Waves size={24} color="var(--primary)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800 }}>서핑 (Surf / Watersports)</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    숏보드, 롱보드, 펀보드, 웻슈트, 핀, 리시 등
                  </div>
                </div>
              </div>

              <div
                onClick={() => setSport('tennis')}
                style={{
                  padding: '18px 16px',
                  borderRadius: 'var(--radius-md)',
                  border:
                    sport === 'tennis' ? '2px solid var(--primary)' : '1px solid var(--border)',
                  background: sport === 'tennis' ? 'var(--primary-light)' : 'var(--surface)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 14,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    background: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Trophy size={24} color="var(--primary)" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1rem', fontWeight: 800 }}>테니스 (Tennis / Racket)</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    라켓, 테니스 가방, 테니스화, 스트링/그립 등
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Basic Info */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 6 }}>
              기본 정보 및 가격
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 20 }}>
              구매자가 쉽게 찾을 수 있도록 정확히 입력해주세요.
            </p>

            <div className="form-group">
              <label className="form-label">장비 사진 첨부</label>
              <div
                style={{
                  border: '2px dashed var(--border-strong)',
                  borderRadius: 'var(--radius-md)',
                  padding: '24px 16px',
                  textAlign: 'center',
                  background: 'var(--surface)',
                  cursor: 'pointer',
                }}
              >
                <Camera size={28} color="var(--text-subtle)" style={{ marginBottom: 6 }} />
                <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  사진 등록하기 (최대 10장)
                </div>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">제목</label>
              <input
                type="text"
                className="form-input"
                placeholder={
                  sport === 'surf'
                    ? '예: Channel Islands Happy Everyday 숏보드 5\'11"'
                    : '예: Wilson Pro Staff 97 v14 라켓 (315g, G2)'
                }
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">브랜드</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder={
                    sport === 'surf' ? '예: Channel Islands, Torq' : '예: Wilson, Head, Babolat'
                  }
                  value={formData.brand}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">모델명</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="예: Pro Staff 97"
                  value={formData.model}
                  onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                />
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">판매 가격 (원)</label>
                <input
                  type="number"
                  className="form-input"
                  placeholder="예: 250000"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">장비 상태</label>
                <select
                  className="form-select"
                  value={formData.condition}
                  onChange={(e) => setFormData({ ...formData, condition: e.target.value })}
                >
                  <option value="like_new">거의 새것</option>
                  <option value="good">사용감 있음</option>
                  <option value="fair">사용감 많음</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">희망 거래 장소</label>
              <input
                type="text"
                className="form-input"
                placeholder={
                  sport === 'surf'
                    ? '예: 강원도 양양군 죽도해변 직거래'
                    : '예: 서울 강남구 / 택배거래 가능'
                }
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              />
            </div>
          </div>
        )}

        {/* Step 3: Specific Sport Specs */}
        {step === 3 && (
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 6 }}>
              {sport === 'surf' ? '🏄‍♂️ 서핑' : '🎾 테니스'} 장비 세부 스펙
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 20 }}>
              상세 스펙을 입력하면 맞춤 추천 알고리즘을 통해 더 빨리 판매됩니다.
            </p>

            {sport === 'surf' ? (
              <>
                <div className="form-group">
                  <label className="form-label">보드 종류</label>
                  <select
                    className="form-select"
                    value={formData.surfDiscipline}
                    onChange={(e) => setFormData({ ...formData, surfDiscipline: e.target.value })}
                  >
                    <option value="shortboard">숏보드 (Shortboard)</option>
                    <option value="longboard">롱보드 (Longboard)</option>
                    <option value="funboard">펀보드 / 미드렝스 (Funboard)</option>
                    <option value="fish">피쉬보드 (Fish)</option>
                    <option value="sup">SUP / 패들보드</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">길이 (Feet)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="예: 5.11, 7.2, 9.2"
                      value={formData.boardLengthFeet}
                      onChange={(e) =>
                        setFormData({ ...formData, boardLengthFeet: e.target.value })
                      }
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">부력 Volume (L)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="예: 32.5, 47.0"
                      value={formData.volumeLiters}
                      onChange={(e) => setFormData({ ...formData, volumeLiters: e.target.value })}
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">핀 시스템</label>
                  <select
                    className="form-select"
                    value={formData.finSystem}
                    onChange={(e) => setFormData({ ...formData, finSystem: e.target.value })}
                  >
                    <option value="fcs2">FCS II</option>
                    <option value="futures">Futures</option>
                    <option value="fcs">FCS 1</option>
                    <option value="single_box">Single Fin Box</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', gap: 10 }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">헤드 사이즈 (sq.in)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="예: 97, 98, 100, 104"
                      value={formData.headSizeSqIn}
                      onChange={(e) => setFormData({ ...formData, headSizeSqIn: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">무게 (g)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="예: 280, 300, 315"
                      value={formData.weightGrams}
                      onChange={(e) => setFormData({ ...formData, weightGrams: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">그립 사이즈</label>
                    <select
                      className="form-select"
                      value={formData.gripSize}
                      onChange={(e) => setFormData({ ...formData, gripSize: e.target.value })}
                    >
                      <option value="1">1 (4 1/8)</option>
                      <option value="2">2 (4 1/4 - 표준)</option>
                      <option value="3">3 (4 3/8)</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: 1 }}>
                    <label className="form-label">플레이 스타일</label>
                    <select
                      className="form-select"
                      value={formData.playStyle}
                      onChange={(e) => setFormData({ ...formData, playStyle: e.target.value })}
                    >
                      <option value="all_court">올라운드 (All-Court)</option>
                      <option value="baseline_aggressive">베이스라인 파워형</option>
                      <option value="serve_volley">서브 & 발리형</option>
                    </select>
                  </div>
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">상세 설명</label>
              <textarea
                className="form-textarea"
                rows={4}
                placeholder="구입 시기, 사용 횟수, 파손/수리 내역, 추가 구성품 등을 자세히 적어주세요."
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="sticky-bottom-action">
        {step > 1 && (
          <button onClick={() => setStep(step - 1)} className="btn-outline" style={{ width: 100 }}>
            이전
          </button>
        )}
        <button onClick={handleNext} className="btn-primary">
          <span>{step === 3 ? '등록 완료하기' : '다음 단계'}</span>
          <ArrowRight size={18} />
        </button>
      </div>
    </MobileShell>
  );
}
