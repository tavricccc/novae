<template>
  <section class="route-page py-2 md:py-6">
    <form class="panel panel-pad" @submit.prevent="findUser">
      <label for="access-user-lookup" class="field-label">新增管理員</label>
      <div class="mt-2 flex gap-2">
        <input
          id="access-user-lookup"
          v-model="lookup"
          class="field min-w-0 flex-1"
          autocomplete="off"
          inputmode="email"
          placeholder="輸入校內 Email 或 UID"
          :disabled="loading || Boolean(savingUid)"
        />
        <button type="submit" class="button-primary shrink-0" :disabled="loading || Boolean(savingUid) || !lookup.trim()">
          <BusyButtonContent :busy="loading" label="查找" busy-label="查找中" />
        </button>
      </div>
      <p class="mt-2 text-xs leading-5 text-ink-500">只會精確查找一位已登入過的使用者，不會載入使用者清單。</p>
    </form>

    <EmptyStatePanel v-if="error" class="mt-4" title="無法查找使用者" :description="error" icon="warning" />

    <article v-if="user" class="panel panel-pad mt-4">
      <div class="flex items-center gap-3 border-b border-ink-100 pb-4 dark:border-ink-800">
        <UserAvatar :photo-url="user.photoUrl" :name="user.name" size="md" />
        <div class="min-w-0">
          <h2 class="truncate text-base font-bold text-ink-900 dark:text-ink-100">{{ user.name }}</h2>
          <p class="mt-0.5 truncate text-xs text-ink-500">{{ user.email || user.uid }}</p>
          <p v-if="user.email" class="mt-0.5 truncate text-xs text-ink-400">{{ user.uid }}</p>
        </div>
      </div>

      <div class="mt-5 space-y-5">
        <div>
          <p class="field-label mb-2">平台權限</p>
          <SelectionOptionButton
            label="平台管理員"
            description="擁有所有分類、設備、公告、角色與統計權限。"
            :selected="isPlatformAdmin"
            :disabled="Boolean(savingUid)"
            @select="togglePlatformAdmin"
          />
        </div>

        <div>
          <p class="field-label mb-2">提案分類</p>
          <div class="grid gap-2">
            <SelectionOptionButton
              v-for="category in ISSUE_CATEGORIES"
              :key="category.id"
              :label="`${category.label}管理員`"
              :description="`只管理「${category.label}」分類。`"
              :selected="isPlatformAdmin || user.managedIssueCategoryIds.includes(category.id)"
              :disabled="Boolean(savingUid) || isPlatformAdmin"
              @select="toggleCategory(category.id)"
            />
          </div>
        </div>

        <div>
          <p class="field-label mb-2">其他領域</p>
          <div class="grid gap-2">
            <SelectionOptionButton
              label="設備管理員"
              description="只處理及管理設備案件。"
              :selected="isPlatformAdmin || user.roles.includes('general-affairs')"
              :disabled="Boolean(savingUid) || isPlatformAdmin"
              @select="toggleScopedRole('general-affairs')"
            />
            <SelectionOptionButton
              label="公告管理員"
              description="只新增、刪除公告及管理公告留言。"
              :selected="isPlatformAdmin || user.roles.includes('announcement-manager')"
              :disabled="Boolean(savingUid) || isPlatformAdmin"
              @select="toggleScopedRole('announcement-manager')"
            />
          </div>
        </div>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import SelectionOptionButton from '@/components/ui/SelectionOptionButton.vue';
import EmptyStatePanel from '@/components/ui/EmptyStatePanel.vue';
import BusyButtonContent from '@/components/ui/BusyButtonContent.vue';
import UserAvatar from '@/components/ui/UserAvatar.vue';
import { ISSUE_CATEGORIES } from '@/generated/issue-categories';
import { listRoleAssignments, setUserRoles, type AccessUser } from '@/services/access';
import type { RoleCode } from '@/services/session-role';

const lookup = ref('');
const user = ref<AccessUser | null>(null);
const loading = ref(false);
const error = ref('');
const savingUid = ref('');
const isPlatformAdmin = computed(() => user.value?.roles.includes('platform-admin') === true);

async function findUser() {
  const query = lookup.value.trim();
  if (!query) return;
  loading.value = true;
  error.value = '';
  user.value = null;
  try {
    const matches = await listRoleAssignments(query);
    user.value = matches[0] ?? null;
    if (!user.value) error.value = '找不到使用者；對方需要先登入過一次，或請確認 Email／UID 是否正確。';
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '查找失敗。';
  } finally {
    loading.value = false;
  }
}

async function saveAccess(roles: RoleCode[], categories: string[]) {
  if (!user.value) return;
  savingUid.value = user.value.uid;
  error.value = '';
  try {
    const result = await setUserRoles(user.value.uid, roles, categories);
    user.value.roles = result.roles;
    user.value.managedIssueCategoryIds = result.managedIssueCategoryIds;
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : '儲存失敗。';
  } finally {
    savingUid.value = '';
  }
}

async function togglePlatformAdmin() {
  if (!user.value) return;
  await saveAccess(isPlatformAdmin.value ? [] : ['platform-admin'], []);
}

async function toggleCategory(categoryId: string) {
  if (!user.value || isPlatformAdmin.value) return;
  const categories = user.value.managedIssueCategoryIds.includes(categoryId)
    ? user.value.managedIssueCategoryIds.filter((value) => value !== categoryId)
    : [...user.value.managedIssueCategoryIds, categoryId];
  await saveAccess(user.value.roles.filter((role) => role !== 'proposal-manager'), categories);
}

async function toggleScopedRole(role: Extract<RoleCode, 'announcement-manager' | 'general-affairs'>) {
  if (!user.value || isPlatformAdmin.value) return;
  const roles = user.value.roles.includes(role)
    ? user.value.roles.filter((value) => value !== role)
    : [...user.value.roles.filter((value) => value !== 'proposal-manager'), role];
  await saveAccess(roles, user.value.managedIssueCategoryIds);
}
</script>
