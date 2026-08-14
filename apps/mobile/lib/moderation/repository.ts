import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  BlockRecord,
  CreateReportInput,
  DbReportReason,
  InputReportTargetType,
  ModerationError,
  ModerationErrorCode,
  ModerationOperatorInfo,
  ModerationRepository,
  ModerationResult,
  ReportReason,
  ReportRecord,
  ReportTargetType,
} from './types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getDefaultSupabaseClient(): SupabaseClient | null {
  try {
    // Lazy import for Node test environment compatibility
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { supabase } = require('../supabase/client');
    return supabase ?? null;
  } catch {
    return null;
  }
}

function success<T>(data: T): ModerationResult<T> {
  return { data, error: null };
}

function failure<T>(
  code: ModerationErrorCode,
  message: string,
  details?: unknown,
): ModerationResult<T> {
  return { data: null, error: { code, message, details } };
}

export function normalizeReportTargetType(targetType: InputReportTargetType): ReportTargetType {
  if (targetType === 'post') {
    return 'community_post';
  }
  return targetType;
}

export function normalizeReportReason(reason: ReportReason): DbReportReason {
  switch (reason) {
    case 'scam':
      return 'fraud';
    case 'hate_speech':
      return 'harassment';
    case 'inappropriate_content':
      return 'other';
    case 'counterfeit':
      return 'prohibited_item';
    case 'unsafe_meetup':
      return 'other';
    case 'spam':
    case 'fraud':
    case 'harassment':
    case 'prohibited_item':
    case 'copyright':
    case 'other':
      return reason;
    default:
      return 'other';
  }
}

export function isValidUuid(id: string): boolean {
  return typeof id === 'string' && UUID_PATTERN.test(id.trim());
}

export function filterBlockedContent<T>(
  items: T[],
  getAuthorId: (item: T) => string | undefined,
  blockedUserIds: Set<string>,
): T[] {
  if (!items || !items.length) return [];
  if (!blockedUserIds || blockedUserIds.size === 0) return items;
  return items.filter((item) => {
    const authorId = getAuthorId(item);
    return !authorId || !blockedUserIds.has(authorId);
  });
}

async function requireAuthenticatedUser(
  client: SupabaseClient,
): Promise<ModerationResult<{ id: string }>> {
  try {
    const { data, error } = await client.auth.getSession();
    if (error) {
      return failure('network_error', error.message, error);
    }
    const user = data.session?.user;
    if (!user || !user.id) {
      return failure('unauthenticated', '인증된 세션이 필요합니다.');
    }
    return success({ id: user.id });
  } catch (err) {
    return failure('network_error', '인증 상태 확인 중 오류가 발생했습니다.', err);
  }
}

export function createSupabaseModerationRepository(
  clientInput?: SupabaseClient | null,
): ModerationRepository {
  const client = clientInput !== undefined ? clientInput : getDefaultSupabaseClient();
  if (!client) {
    const unavailable = async <T>(): Promise<ModerationResult<T>> =>
      failure('not_configured', 'Supabase 클라이언트가 설정되지 않았습니다.');
    return {
      submitReport: unavailable,
      blockUser: unavailable,
      unblockUser: unavailable,
      getBlockedUserIds: unavailable,
      isUserBlocked: unavailable,
      checkOperatorRole: unavailable,
      updatePublicationStatus: unavailable,
      filterBlockedContent,
    };
  }

  async function submitReport(input: CreateReportInput): Promise<ModerationResult<ReportRecord>> {
    const authResult = await requireAuthenticatedUser(client!);
    if (authResult.error) return failure(authResult.error.code, authResult.error.message);
    const reporterId = authResult.data.id;

    if (!input.targetId || !isValidUuid(input.targetId)) {
      return failure('invalid_target', '유효하지 않은 신고 대상 ID입니다.');
    }

    const targetType = normalizeReportTargetType(input.targetType);
    const dbReason = normalizeReportReason(input.reason);
    const details = input.details?.trim() || null;

    try {
      // 1. Idempotency check: query existing report by same reporter
      const { data: existing, error: queryError } = await client!
        .from('reports')
        .select('id,reporter_id,target_type,target_id,reason,details,status,created_at,updated_at')
        .eq('reporter_id', reporterId)
        .eq('target_type', targetType)
        .eq('target_id', input.targetId)
        .maybeSingle();

      if (!queryError && existing) {
        return success({
          id: existing.id,
          reporterId: existing.reporter_id,
          targetType: existing.target_type as ReportTargetType,
          targetId: existing.target_id,
          reason: existing.reason as DbReportReason,
          details: existing.details,
          status: existing.status,
          createdAt: existing.created_at,
          updatedAt: existing.updated_at,
        });
      }

      // 2. Insert new report row
      const { data, error } = await client!
        .from('reports')
        .insert({
          reporter_id: reporterId,
          target_type: targetType,
          target_id: input.targetId,
          reason: dbReason,
          details,
          status: 'open',
        })
        .select('id,reporter_id,target_type,target_id,reason,details,status,created_at,updated_at')
        .single();

      if (error) {
        return failure('network_error', '신고 접수 중 오류가 발생했습니다.', error);
      }

      return success({
        id: data.id,
        reporterId: data.reporter_id,
        targetType: data.target_type as ReportTargetType,
        targetId: data.target_id,
        reason: data.reason as DbReportReason,
        details: data.details,
        status: data.status,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      });
    } catch (err) {
      return failure('network_error', '신고 요청 처리 실패', err);
    }
  }

  async function blockUser(blockedId: string): Promise<ModerationResult<BlockRecord>> {
    const authResult = await requireAuthenticatedUser(client!);
    if (authResult.error) return failure(authResult.error.code, authResult.error.message);
    const blockerId = authResult.data.id;

    if (!blockedId || !isValidUuid(blockedId)) {
      return failure('invalid_target', '유효하지 않은 사용자 ID입니다.');
    }

    if (blockerId === blockedId) {
      return failure('self_block_forbidden', '자기 자신을 차단할 수 없습니다.');
    }

    try {
      // 1. Idempotency check: query existing block
      const { data: existing } = await client!
        .from('blocks')
        .select('blocker_id,blocked_id,created_at')
        .eq('blocker_id', blockerId)
        .eq('blocked_id', blockedId)
        .maybeSingle();

      if (existing) {
        return success({
          blockerId: existing.blocker_id,
          blockedId: existing.blocked_id,
          createdAt: existing.created_at,
        });
      }

      // 2. Insert new block row
      const { data, error } = await client!
        .from('blocks')
        .insert({
          blocker_id: blockerId,
          blocked_id: blockedId,
        })
        .select('blocker_id,blocked_id,created_at')
        .single();

      if (error) {
        // If unique constraint duplicate occurred concurrently
        const { data: fallback } = await client!
          .from('blocks')
          .select('blocker_id,blocked_id,created_at')
          .eq('blocker_id', blockerId)
          .eq('blocked_id', blockedId)
          .maybeSingle();

        if (fallback) {
          return success({
            blockerId: fallback.blocker_id,
            blockedId: fallback.blocked_id,
            createdAt: fallback.created_at,
          });
        }
        return failure('network_error', '차단 처리 중 오류가 발생했습니다.', error);
      }

      return success({
        blockerId: data.blocker_id,
        blockedId: data.blocked_id,
        createdAt: data.created_at,
      });
    } catch (err) {
      return failure('network_error', '사용자 차단 요청 실패', err);
    }
  }

  async function unblockUser(blockedId: string): Promise<ModerationResult<{ unblocked: true }>> {
    const authResult = await requireAuthenticatedUser(client!);
    if (authResult.error) return failure(authResult.error.code, authResult.error.message);
    const blockerId = authResult.data.id;

    if (!blockedId || !isValidUuid(blockedId)) {
      return failure('invalid_target', '유효하지 않은 사용자 ID입니다.');
    }

    try {
      const { error } = await client!
        .from('blocks')
        .delete()
        .eq('blocker_id', blockerId)
        .eq('blocked_id', blockedId);

      if (error) {
        return failure('network_error', '차단 해제 중 오류가 발생했습니다.', error);
      }

      return success({ unblocked: true });
    } catch (err) {
      return failure('network_error', '차단 해제 요청 실패', err);
    }
  }

  async function getBlockedUserIds(): Promise<ModerationResult<Set<string>>> {
    const authResult = await requireAuthenticatedUser(client!);
    if (authResult.error) return failure(authResult.error.code, authResult.error.message);
    const blockerId = authResult.data.id;

    try {
      const { data, error } = await client!
        .from('blocks')
        .select('blocked_id')
        .eq('blocker_id', blockerId);

      if (error) {
        return failure('network_error', '차단 목록을 불러올 수 없습니다.', error);
      }

      const blockedSet = new Set<string>();
      for (const row of data || []) {
        if (row.blocked_id) blockedSet.add(row.blocked_id);
      }

      return success(blockedSet);
    } catch (err) {
      return failure('network_error', '차단 목록 조회 실패', err);
    }
  }

  async function isUserBlocked(targetUserId: string): Promise<ModerationResult<boolean>> {
    const result = await getBlockedUserIds();
    if (result.error) return failure(result.error.code, result.error.message);
    return success(result.data.has(targetUserId));
  }

  async function checkOperatorRole(): Promise<ModerationResult<ModerationOperatorInfo>> {
    const authResult = await requireAuthenticatedUser(client!);
    if (authResult.error) return failure(authResult.error.code, authResult.error.message);
    const viewerId = authResult.data.id;

    try {
      const { data, error } = await client!
        .from('profiles')
        .select('role,is_banned')
        .eq('id', viewerId)
        .maybeSingle();

      if (error) {
        return failure('network_error', '프로필 정보 조회 실패', error);
      }

      const role = (data?.role as 'user' | 'moderator' | 'admin' | undefined) ?? 'user';
      const isBanned = Boolean(data?.is_banned);
      const isOperator = (role === 'moderator' || role === 'admin') && !isBanned;

      return success({ isOperator, role, isBanned });
    } catch (err) {
      return failure('network_error', '운영자 권한 검사 실패', err);
    }
  }

  async function updatePublicationStatus(input: {
    targetType: 'listing' | 'community_post';
    targetId: string;
    nextStatus: string;
  }): Promise<ModerationResult<{ targetId: string; status: string }>> {
    const operatorCheck = await checkOperatorRole();
    if (operatorCheck.error) return failure(operatorCheck.error.code, operatorCheck.error.message);
    if (!operatorCheck.data.isOperator) {
      return failure('forbidden', '운영자 전용 권한이 필요합니다.');
    }

    if (!input.targetId || !isValidUuid(input.targetId)) {
      return failure('invalid_target', '유효하지 않은 대상 ID입니다.');
    }

    const tableName = input.targetType === 'community_post' ? 'community_posts' : 'listings';

    try {
      const { data, error } = await client!
        .from(tableName)
        .update({ status: input.nextStatus })
        .eq('id', input.targetId)
        .select('id,status')
        .maybeSingle();

      if (error) {
        return failure('network_error', '게시 상태 변경 중 오류가 발생했습니다.', error);
      }

      if (!data) {
        return failure('not_found', '게시물을 찾을 수 없습니다.');
      }

      return success({ targetId: data.id, status: data.status });
    } catch (err) {
      return failure('network_error', '게시 상태 변경 실패', err);
    }
  }

  return {
    submitReport,
    blockUser,
    unblockUser,
    getBlockedUserIds,
    isUserBlocked,
    checkOperatorRole,
    updatePublicationStatus,
    filterBlockedContent,
  };
}

export const moderationRepository = createSupabaseModerationRepository();
