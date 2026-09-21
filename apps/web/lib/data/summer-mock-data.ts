export interface MockListing {
  id: string;
  sellerId?: string;
  sport: 'surf' | 'tennis';
  sportLabel: string;
  category: 'equipment' | 'apparel' | 'footwear' | 'accessories';
  title: string;
  price: number;
  currency: string;
  condition: 'like_new' | 'good' | 'fair';
  conditionLabel: string;
  location: string;
  seller: {
    name: string;
    avatar: string;
    rating: number;
    transactionCount: number;
  };
  images: string[];
  specs: Record<string, string>;
  description: string;
  recommendationReason?: string;
  favoriteCount: number;
  chatCount: number;
  createdAt: string;
}

export const SUMMER_LISTINGS: MockListing[] = [
  {
    id: 'surf-001',
    sport: 'surf',
    sportLabel: '서핑',
    category: 'equipment',
    title: 'Channel Islands Happy Everyday 숏보드 5\'11" (32L)',
    price: 680000,
    currency: 'KRW',
    condition: 'like_new',
    conditionLabel: '거의 새것',
    location: '강원도 양양군 죽도해변',
    seller: {
      name: '양양파도타기',
      avatar:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      rating: 4.9,
      transactionCount: 14,
    },
    images: [
      'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&auto=format&fit=crop&q=80',
    ],
    specs: {
      '장비 종류': '숏보드 (Shortboard)',
      '보드 길이': '5\'11" (180cm)',
      '부력 (Volume)': '32.6 Liters',
      '핀 시스템': 'FCS II (Tri-Fin)',
      '추천 실력': '중급 ~ 상급',
    },
    description:
      '작년 8월에 구매해 3회 입수한 극미중고입니다. 딩(파손)이나 덴트 일절 없고 왁스만 깨끗하게 제거해 둔 상태입니다. FCS2 핀 포함해서 드립니다.',
    recommendationReason: '중급 서퍼에게 최적화된 32L 숏보드',
    favoriteCount: 23,
    chatCount: 5,
    createdAt: '2시간 전',
  },
  {
    id: 'tennis-001',
    sport: 'tennis',
    sportLabel: '테니스',
    category: 'equipment',
    title: 'Wilson Pro Staff 97 v14 라켓 (315g, G2)',
    price: 240000,
    currency: 'KRW',
    condition: 'like_new',
    conditionLabel: '거의 새것',
    location: '서울 강남구 압구정동',
    seller: {
      name: '로저마니아',
      avatar:
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      rating: 5.0,
      transactionCount: 28,
    },
    images: [
      'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=800&auto=format&fit=crop&q=80',
      'https://images.unsplash.com/photo-1617083934555-563d33190b39?w=800&auto=format&fit=crop&q=80',
    ],
    specs: {
      '헤드 사이즈': '97 sq.in',
      '무게 (Unstrung)': '315g',
      '그립 사이즈': '2 (4 1/4)',
      '스트링 패턴': '16x19',
      '추천 실력': '중상급 ~ 상급',
    },
    description:
      '프로스태프 v14 315g 2그립입니다. 헤드 가드에 미세한 쓸림 외에는 프레임 기스 없이 아주 깨끗합니다. 럭실론 알루파워 52/50 스트링 작업되어 있습니다.',
    recommendationReason: '정밀한 컨트롤을 원하는 파워 플레이어 맞춤',
    favoriteCount: 41,
    chatCount: 8,
    createdAt: '3시간 전',
  },
  {
    id: 'surf-002',
    sport: 'surf',
    sportLabel: '서핑',
    category: 'equipment',
    title: 'Torq TET Mod Fun 7\'2" 서프보드 (입문/중급 추천)',
    price: 490000,
    currency: 'KRW',
    condition: 'good',
    conditionLabel: '사용감 있음',
    location: '부산 해운대구 송정해변',
    seller: {
      name: '송정파도',
      avatar:
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      rating: 4.8,
      transactionCount: 9,
    },
    images: [
      'https://images.unsplash.com/photo-1508873696983-2df5293cb32b?w=800&auto=format&fit=crop&q=80',
    ],
    specs: {
      '장비 종류': '펀보드 (Funboard / Mid-length)',
      '보드 길이': '7\'2" (218cm)',
      '부력 (Volume)': '47.2 Liters',
      '핀 시스템': 'Futures Fins',
      '추천 실력': '초보자 ~ 중급',
    },
    description:
      '롱보드에서 숏보드로 넘어가거나 안정적인 테이크오프를 원하는 분께 완벽한 펀보드입니다. 에폭시 소재라 튼튼합니다. 리시코드와 핀 일괄 양도합니다.',
    recommendationReason: '테이크오프 연습에 최적인 고부력 펀보드',
    favoriteCount: 19,
    chatCount: 3,
    createdAt: '5시간 전',
  },
  {
    id: 'tennis-002',
    sport: 'tennis',
    sportLabel: '테니스',
    category: 'equipment',
    title: 'Babolat Pure Aero 2023 (300g, 100sq.in, G2)',
    price: 210000,
    currency: 'KRW',
    condition: 'good',
    conditionLabel: '사용감 있음',
    location: '경기 성남시 분당구',
    seller: {
      name: '스핀마스터',
      avatar:
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      rating: 4.7,
      transactionCount: 19,
    },
    images: [
      'https://images.unsplash.com/photo-1595435934249-5df7ed86e1c0?w=800&auto=format&fit=crop&q=80',
    ],
    specs: {
      '헤드 사이즈': '100 sq.in',
      '무게 (Unstrung)': '300g',
      '그립 사이즈': '2 (4 1/4)',
      '스트링 패턴': '16x19',
      '추천 실력': '올라운드 / 중급',
    },
    description:
      '강력한 스핀과 반발력의 퓨어에어로입니다. 6개월 주 1회 사용했습니다. 범퍼 가드 생활 기스 있으며 크랙 전혀 없습니다.',
    recommendationReason: '스핀과 안정성을 고루 갖춘 인기 라켓',
    favoriteCount: 35,
    chatCount: 12,
    createdAt: '6시간 전',
  },
  {
    id: 'surf-003',
    sport: 'surf',
    sportLabel: '서핑',
    category: 'apparel',
    title: "O'Neill Hyperfreak 3/2mm 풀슈트 웻슈트 (M사이즈)",
    price: 180000,
    currency: 'KRW',
    condition: 'like_new',
    conditionLabel: '거의 새것',
    location: '제주 서귀포시 중문',
    seller: {
      name: '제주서퍼걸',
      avatar:
        'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=150&auto=format&fit=crop&q=80',
      rating: 5.0,
      transactionCount: 31,
    },
    images: [
      'https://images.unsplash.com/photo-1518495973542-4542c06a5843?w=800&auto=format&fit=crop&q=80',
    ],
    specs: {
      두께: '3/2mm',
      사이즈: 'M (신장 172-178cm, 65-72kg)',
      '지퍼 타입': 'Chest Zip (체스트 집)',
      계절: '봄/가을/초여름',
    },
    description:
      '신축성 최고인 오닐 하이퍼프릭 슈트입니다. 착용감 거의 새 상품 수준이며 담수 세척 후 그늘 건조 철저히 했습니다.',
    recommendationReason: '가장 편안한 신축성의 3/2mm 체스트집 슈트',
    favoriteCount: 15,
    chatCount: 4,
    createdAt: '1일 전',
  },
  {
    id: 'tennis-003',
    sport: 'tennis',
    sportLabel: '테니스',
    category: 'footwear',
    title: 'Nike Court Air Zoom Vapor Pro 2 올코트화 (270mm)',
    price: 95000,
    currency: 'KRW',
    condition: 'like_new',
    conditionLabel: '거의 새것',
    location: '서울 송파구 잠실동',
    seller: {
      name: '테니스러버',
      avatar:
        'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?w=150&auto=format&fit=crop&q=80',
      rating: 4.9,
      transactionCount: 22,
    },
    images: [
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=800&auto=format&fit=crop&q=80',
    ],
    specs: {
      사이즈: '270mm (US 9)',
      아웃솔: 'All-Court (올코트용)',
      색상: '화이트/블루/오렌지',
    },
    description:
      '실내 하드코트에서 2번 신었습니다. 아웃솔 마모 전혀 없고 인솔도 깨끗합니다. 정품 박스 포함입니다.',
    recommendationReason: '접지력과 경량성이 뛰어난 올코트 테니스화',
    favoriteCount: 28,
    chatCount: 7,
    createdAt: '1일 전',
  },
];

export interface MockCommunityPost {
  id: string;
  sport: 'surf' | 'tennis';
  sportLabel: string;
  category: 'tip' | 'review' | 'meetup' | 'discussion';
  categoryLabel: string;
  title: string;
  content: string;
  author: {
    name: string;
    avatar: string;
    level: string;
  };
  image?: string;
  likes: number;
  comments: number;
  createdAt: string;
}

export const SUMMER_COMMUNITY_POSTS: MockCommunityPost[] = [
  {
    id: 'post-001',
    sport: 'surf',
    sportLabel: '서핑',
    category: 'tip',
    categoryLabel: '서핑 꿀팁',
    title: '양양 입문 서퍼들을 위한 라인업 에티켓 & 파도 보는 법',
    content:
      '여름 시즌 양양이나 송정 가시는 분들 많으시죠! 피크 우선권(Peak Priority) 규칙과 패들 아웃할 때 라인업 방해하지 않는 기본 수칙 정리해 드립니다...',
    author: {
      name: '웨이브체이서',
      avatar:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
      level: '서핑 5년차',
    },
    image:
      'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=800&auto=format&fit=crop&q=80',
    likes: 48,
    comments: 16,
    createdAt: '4시간 전',
  },
  {
    id: 'post-002',
    sport: 'tennis',
    sportLabel: '테니스',
    category: 'review',
    categoryLabel: '라켓 시타기',
    title: 'Wilson 프로스태프 v14 vs 헤드 스피드 MP 1개월 실사용 비교',
    content:
      '컨트롤 위주의 프로스태프와 스핀/반발력 위주의 스피드 MP를 번갈아가며 사용해봤습니다. 스트로크 임팩트감과 발리 반응성에서 어떤 차이가 있는지 공유합니다!',
    author: {
      name: '랠리왕김테니스',
      avatar:
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      level: '구력 3년차 (NTRP 3.5)',
    },
    image:
      'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=800&auto=format&fit=crop&q=80',
    likes: 62,
    comments: 24,
    createdAt: '7시간 전',
  },
  {
    id: 'post-003',
    sport: 'surf',
    sportLabel: '서핑',
    category: 'meetup',
    categoryLabel: '번개/모임',
    title: '[이번주 토] 양양 죽도 새벽 세션 카풀 & 같이 서핑하실 분!',
    content:
      '토요일 새벽 4시 서울 잠실 출발해서 양양 죽도 당일치기 세션 가실 분 2분 모십니다. 숏보드/펀보드 적재 가능합니다. 뒷정리하고 막국수 같이 먹어요!',
    author: {
      name: '동해파도러버',
      avatar:
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      level: '서핑 2년차',
    },
    likes: 31,
    comments: 9,
    createdAt: '12시간 전',
  },
  {
    id: 'post-004',
    sport: 'tennis',
    sportLabel: '테니스',
    category: 'meetup',
    categoryLabel: '클럽/게스트',
    title: '[매주 일] 서울 서초/반포 테니스클럽 2030 게스트 모집 (NTRP 2.5~3.5)',
    content:
      '매주 일요일 저녁 6시~8시 반포 코트에서 복식 경기 함께 하실 게스트 분들 환영합니다. 매너 좋고 즐겁게 땀 흘리실 분 댓글이나 채팅 남겨주세요.',
    author: {
      name: '반포에이스',
      avatar:
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
      level: 'NTRP 4.0',
    },
    likes: 27,
    comments: 14,
    createdAt: '1일 전',
  },
];

export interface MockChatMessage {
  id: string;
  sender: 'me' | 'other';
  text: string;
  time: string;
}

export interface MockChatRoom {
  id: string;
  listingId: string;
  listingTitle: string;
  listingPrice: number;
  listingImage: string;
  otherUser: {
    name: string;
    avatar: string;
  };
  lastMessage: string;
  lastMessageTime: string;
  unreadCount: number;
  messages: MockChatMessage[];
}

export const SUMMER_CHAT_ROOMS: MockChatRoom[] = [
  {
    id: 'chat-001',
    listingId: 'surf-001',
    listingTitle: 'Channel Islands Happy Everyday 숏보드 5\'11" (32L)',
    listingPrice: 680000,
    listingImage:
      'https://images.unsplash.com/photo-1502680390469-be75c86b636f?w=400&auto=format&fit=crop&q=80',
    otherUser: {
      name: '양양파도타기',
      avatar:
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    },
    lastMessage: '네 이번 주말 양양 죽도에서 직거래 가능합니다!',
    lastMessageTime: '오후 2:40',
    unreadCount: 1,
    messages: [
      {
        id: 'm1',
        sender: 'me',
        text: '안녕하세요! 보드 혹시 주말에 직거래 가능할까요?',
        time: '오후 2:32',
      },
      {
        id: 'm2',
        sender: 'other',
        text: '안녕하세요! 네 이번 주말 양양 죽도에서 직거래 가능합니다!',
        time: '오후 2:40',
      },
    ],
  },
  {
    id: 'chat-002',
    listingId: 'tennis-001',
    listingTitle: 'Wilson Pro Staff 97 v14 라켓 (315g, G2)',
    listingPrice: 240000,
    listingImage:
      'https://images.unsplash.com/photo-1622279457486-62dcc4a431d6?w=400&auto=format&fit=crop&q=80',
    otherUser: {
      name: '로저마니아',
      avatar:
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    },
    lastMessage: '택배거래도 가능합니다. 꼼꼼히 에어캡 포장해드릴게요.',
    lastMessageTime: '어제',
    unreadCount: 0,
    messages: [
      { id: 'm3', sender: 'me', text: '라켓 스트링 텐션 몇으로 매어져 있나요?', time: '어제' },
      {
        id: 'm4',
        sender: 'other',
        text: '럭실론 알루파워 52/50으로 작업되어 있습니다!',
        time: '어제',
      },
      {
        id: 'm5',
        sender: 'other',
        text: '택배거래도 가능합니다. 꼼꼼히 에어캡 포장해드릴게요.',
        time: '어제',
      },
    ],
  },
];
