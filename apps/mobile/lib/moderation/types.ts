export type ReportTargetType =
  'listing' | 'community_post' | 'comment' | 'profile' | 'message' | 'review';

export type InputReportTargetType = ReportTargetType | 'post';

export type DbReportReason =
  'spam' | 'fraud' | 'harassment' | 'prohibited_item' | 'copyright' | 'other';

export type ReportReason =
  | DbReportReason
  | 'scam'
  | 'hate_speech'
  | 'inappropriate_content'
  | 'counterfeit'
  | 'unsafe_meetup';

export type ReportStatus = 'open' | 'in_review' | 'resolved' | 'dismissed';

export interface CreateReportInput {
  targetType: InputReportTargetType;
  targetId: string;
  reason: ReportReason;
  details?: string;
}

export interface ReportRecord {
  id: string;
  reporterId: string;
  targetType: ReportTargetType;
  targetId: string;
  reason: DbReportReason;
  details: string | null;
  status: ReportStatus;
  createdAt: string;
  updatedAt: string;
}

export interface BlockRecord {
  blockerId: string;
  blockedId: string;
  createdAt: string;
}

export type ModerationErrorCode =
  | 'not_configured'
  | 'unauthenticated'
  | 'invalid_target'
  | 'self_block_forbidden'
  | 'validation_error'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'network_error'
  | 'mapping_error';

export interface ModerationError {
  code: ModerationErrorCode;
  message: string;
  details?: unknown;
}

export type ModerationResult<T> = { data: T; error: null } | { data: null; error: ModerationError };

export interface ModerationOperatorInfo {
  isOperator: boolean;
  role: 'user' | 'moderator' | 'admin';
  isBanned: boolean;
}

export interface ModerationRepository {
  submitReport(input: CreateReportInput): Promise<ModerationResult<ReportRecord>>;
  blockUser(blockedId: string): Promise<ModerationResult<BlockRecord>>;
  unblockUser(blockedId: string): Promise<ModerationResult<{ unblocked: true }>>;
  getBlockedUserIds(): Promise<ModerationResult<Set<string>>>;
  isUserBlocked(targetUserId: string): Promise<ModerationResult<boolean>>;
  checkOperatorRole(): Promise<ModerationResult<ModerationOperatorInfo>>;
  updatePublicationStatus(input: {
    targetType: 'listing' | 'community_post';
    targetId: string;
    nextStatus: string;
  }): Promise<ModerationResult<{ targetId: string; status: string }>>;
  filterBlockedContent<T>(
    items: T[],
    getAuthorId: (item: T) => string | undefined,
    blockedUserIds: Set<string>,
  ): T[];
}
