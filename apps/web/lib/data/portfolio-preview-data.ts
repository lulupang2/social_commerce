export type PreviewSport = 'surf' | 'tennis';

export interface PortfolioPreviewListing {
  id: string;
  sport: PreviewSport;
  category: string;
  title: string;
  price: number;
  condition: string;
  location: string;
  image: string;
  imageAlt: string;
  description: string;
  specs: Array<[string, string]>;
  liveHref?: string;
}

const image = (id: string) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=1200&q=82`;

export const PORTFOLIO_PREVIEW_LISTINGS: PortfolioPreviewListing[] = [
  {
    id: 'surf-shortboard-60',
    sport: 'surf',
    category: '숏보드',
    title: "에폭시 퍼포먼스 숏보드 6'0 31L",
    price: 520000,
    condition: '거의 새것',
    location: '강원 양양',
    image: image('photo-1645484031425-b107248121fc'),
    imageAlt: '모래 위에 놓인 밝은 색상의 서프보드',
    description:
      '가볍고 반응이 빠른 31L 퍼포먼스 보드입니다. 작은 생활 흔적만 있는 상태를 가정한 포트폴리오용 샘플 상품입니다.',
    specs: [
      ['길이', "6'0"],
      ['부력', '31L'],
      ['핀', 'Thruster'],
      ['재질', 'Epoxy'],
    ],
    liveHref: '/market/surf-001?source=demo',
  },
  {
    id: 'tennis-control-97',
    sport: 'tennis',
    category: '라켓',
    title: '컨트롤 라켓 97sq 315g G2',
    price: 238000,
    condition: '거의 새것',
    location: '서울 성동',
    image: image('photo-1651319087172-d27177766eab'),
    imageAlt: '테니스 라켓 두 자루가 나란히 놓인 모습',
    description:
      '정교한 타구감을 선호하는 중상급자를 위한 97 스퀘어인치 라켓이라는 설정의 샘플 상품입니다.',
    specs: [
      ['헤드', '97 sq.in'],
      ['무게', '315g'],
      ['그립', 'G2'],
      ['패턴', '16 x 19'],
    ],
    liveHref: '/market/tennis-001?source=demo',
  },
  {
    id: 'surf-midlength-72',
    sport: 'surf',
    category: '미드렝스',
    title: "안정적인 미드렝스 보드 7'2 47L",
    price: 465000,
    condition: '사용감 적음',
    location: '부산 송정',
    image: image('photo-1526918761918-da528d9558c5'),
    imageAlt: '해변 모래 위 서프보드와 바다',
    description:
      '테이크오프 안정성과 회전성을 함께 원하는 라이더를 위한 7피트대 미드렝스 보드 샘플입니다.',
    specs: [
      ['길이', "7'2"],
      ['부력', '47L'],
      ['핀', '2 + 1'],
      ['재질', 'Epoxy'],
    ],
  },
  {
    id: 'tennis-spin-100',
    sport: 'tennis',
    category: '라켓',
    title: '스핀 라켓 100sq 300g G2',
    price: 205000,
    condition: '사용감 적음',
    location: '경기 성남',
    image: image('photo-1761449021274-c86396951d1c'),
    imageAlt: '테니스 코트 위 라켓과 테니스 공',
    description:
      '100 스퀘어인치 헤드와 300g 무게로 스핀과 안정성을 균형 있게 잡은 샘플 라켓입니다.',
    specs: [
      ['헤드', '100 sq.in'],
      ['무게', '300g'],
      ['그립', 'G2'],
      ['패턴', '16 x 19'],
    ],
  },
  {
    id: 'surf-longboard-94',
    sport: 'surf',
    category: '롱보드',
    title: "클래식 싱글핀 롱보드 9'4",
    price: 790000,
    condition: '사용감 있음',
    location: '제주 월정리',
    image: image('photo-1646054346984-3268571524ae'),
    imageAlt: '양양 해변의 서프보드와 구조대 의자',
    description:
      '느긋한 크루징과 노즈라이딩을 상정한 클래식 롱보드 포트폴리오 샘플입니다.',
    specs: [
      ['길이', "9'4"],
      ['핀', 'Single'],
      ['테일', 'Square'],
      ['재질', 'PU'],
    ],
  },
  {
    id: 'tennis-team-100',
    sport: 'tennis',
    category: '라켓',
    title: '올라운드 팀 라켓 100sq 285g G2',
    price: 148000,
    condition: '거의 새것',
    location: '대구 수성',
    image: image('photo-1740732033332-a65566d30795'),
    imageAlt: '벽에 걸린 테니스 라켓',
    description:
      '조작성이 좋은 285g 세팅을 가정한 올라운드형 샘플 라켓입니다.',
    specs: [
      ['헤드', '100 sq.in'],
      ['무게', '285g'],
      ['그립', 'G2'],
      ['밸런스', '325mm'],
    ],
  },
  {
    id: 'surf-twinfin-58',
    sport: 'surf',
    category: '숏보드',
    title: "레트로 트윈핀 서프보드 5'8 34L",
    price: 410000,
    condition: '사용감 적음',
    location: '강원 고성',
    image: image('photo-1645484031425-b107248121fc'),
    imageAlt: '모래 위에 놓인 밝은 색상의 서프보드',
    description:
      '작은 파도에서도 속도감을 즐기기 좋은 트윈핀 셰이프를 가정한 샘플 상품입니다.',
    specs: [
      ['길이', "5'8"],
      ['부력', '34L'],
      ['핀', 'Twin'],
      ['테일', 'Swallow'],
    ],
  },
  {
    id: 'tennis-pro-98',
    sport: 'tennis',
    category: '라켓',
    title: '플랫 드라이브 라켓 98sq 305g G3',
    price: 192000,
    condition: '사용감 있음',
    location: '서울 송파',
    image: image('photo-1634475668147-e49db624e590'),
    imageAlt: '테니스 코트 위에 놓인 라켓',
    description:
      '낮고 빠른 플랫 드라이브를 선호하는 플레이어를 위한 98 스퀘어인치 샘플 라켓입니다.',
    specs: [
      ['헤드', '98 sq.in'],
      ['무게', '305g'],
      ['그립', 'G3'],
      ['패턴', '16 x 19'],
    ],
  },
  {
    id: 'surf-boardbag-72',
    sport: 'surf',
    category: '보드 액세서리',
    title: "데이 보드백 7'2 패드형",
    price: 68000,
    condition: '거의 새것',
    location: '부산 해운대',
    image: image('photo-1526918761918-da528d9558c5'),
    imageAlt: '해변 모래 위 서프보드와 바다',
    description:
      '차량 이동과 일상 보관에 필요한 기본 패딩을 갖춘 보드백이라는 설정의 샘플 상품입니다.',
    specs: [
      ['길이', "7'2"],
      ['패딩', '5mm'],
      ['지퍼', '부식 방지'],
      ['수납', '핀 포켓'],
    ],
  },
  {
    id: 'tennis-racketbag-6',
    sport: 'tennis',
    category: '가방',
    title: '라켓백 6자루 수납 네이비',
    price: 72000,
    condition: '사용감 적음',
    location: '광주 서구',
    image: image('photo-1651319087172-d27177766eab'),
    imageAlt: '테니스 라켓 두 자루가 나란히 놓인 모습',
    description:
      '라켓과 신발, 소품을 분리해서 담는 6자루 규격 라켓백을 가정한 샘플 상품입니다.',
    specs: [
      ['수납', '라켓 6자루'],
      ['스트랩', '백팩형'],
      ['포켓', '3개'],
      ['색상', 'Navy'],
    ],
  },
  {
    id: 'surf-finset',
    sport: 'surf',
    category: '핀',
    title: '허니콤 트라이핀 세트 M',
    price: 82000,
    condition: '거의 새것',
    location: '강원 양양',
    image: image('photo-1646054346984-3268571524ae'),
    imageAlt: '양양 해변의 서프보드와 구조대 의자',
    description:
      '중간 체중대 라이더가 균형 잡힌 드라이브를 얻도록 설정한 트라이핀 샘플 상품입니다.',
    specs: [
      ['구성', '3 Fin'],
      ['사이즈', 'M'],
      ['재질', 'Honeycomb'],
      ['호환', 'Dual tab'],
    ],
  },
  {
    id: 'tennis-junior-26',
    sport: 'tennis',
    category: '주니어 라켓',
    title: '주니어 라켓 26인치 250g',
    price: 59000,
    condition: '사용감 적음',
    location: '대전 유성',
    image: image('photo-1761449021274-c86396951d1c'),
    imageAlt: '테니스 코트 위 라켓과 테니스 공',
    description:
      '성장기 주니어가 성인 라켓으로 넘어가기 전에 사용하기 좋은 26인치 규격 샘플 상품입니다.',
    specs: [
      ['길이', '26 inch'],
      ['무게', '250g'],
      ['헤드', '100 sq.in'],
      ['그립', 'G0'],
    ],
  },
  {
    id: 'surf-leash-8',
    sport: 'surf',
    category: '리시',
    title: '8ft 컴프 리시코드 블루',
    price: 29000,
    condition: '거의 새것',
    location: '제주 애월',
    image: image('photo-1645484031425-b107248121fc'),
    imageAlt: '모래 위에 놓인 밝은 색상의 서프보드',
    description:
      '미드렝스와 작은 롱보드에 맞춘 8피트 리시코드를 가정한 포트폴리오 샘플입니다.',
    specs: [
      ['길이', '8 ft'],
      ['두께', '7 mm'],
      ['회전', 'Double swivel'],
      ['색상', 'Blue'],
    ],
  },
  {
    id: 'tennis-ballcase',
    sport: 'tennis',
    category: '볼',
    title: '하드코트 테니스볼 12캔 세트',
    price: 54000,
    condition: '미개봉 설정',
    location: '인천 연수',
    image: image('photo-1761449021274-c86396951d1c'),
    imageAlt: '테니스 코트 위 라켓과 테니스 공',
    description:
      '연습용 하드코트 볼을 12캔 단위로 구성한 포트폴리오 시연용 샘플 상품입니다.',
    specs: [
      ['구성', '12 cans'],
      ['볼', '캔당 3개'],
      ['코트', 'Hard court'],
      ['용도', 'Practice'],
    ],
  },
  {
    id: 'surf-traction',
    sport: 'surf',
    category: '트랙션',
    title: '3피스 서프 트랙션 패드 블랙',
    price: 36000,
    condition: '미사용 설정',
    location: '부산 광안',
    image: image('photo-1526918761918-da528d9558c5'),
    imageAlt: '해변 모래 위 서프보드와 바다',
    description:
      '숏보드 테일에 맞춘 3피스 트랙션 패드를 가정한 포트폴리오 시연 상품입니다.',
    specs: [
      ['구성', '3 piece'],
      ['아치', 'Medium'],
      ['킥', '25 mm'],
      ['색상', 'Black'],
    ],
  },
  {
    id: 'tennis-overgrip',
    sport: 'tennis',
    category: '그립',
    title: '드라이 오버그립 10개 화이트',
    price: 24000,
    condition: '미개봉 설정',
    location: '서울 마포',
    image: image('photo-1740732033332-a65566d30795'),
    imageAlt: '벽에 걸린 테니스 라켓',
    description:
      '땀이 많은 플레이어를 위한 드라이 타입 오버그립 10개 세트라는 설정의 샘플 상품입니다.',
    specs: [
      ['구성', '10 pcs'],
      ['타입', 'Dry'],
      ['두께', '0.6 mm'],
      ['색상', 'White'],
    ],
  },
];

export const PORTFOLIO_PREVIEW_FEATURED = PORTFOLIO_PREVIEW_LISTINGS[0];

export function getPortfolioPreviewListing(id: string) {
  return PORTFOLIO_PREVIEW_LISTINGS.find((item) => item.id === id) ?? null;
}
