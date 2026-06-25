<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 1000px;">
	<div :class="$style.root">
		<MkFoldableSection class="item">
			<template #header>Moderators</template>
			<XModerators/>
		</MkFoldableSection>

		<MkFoldableSection class="item">
			<template #header>Instances</template>
			<XInstances/>
		</MkFoldableSection>

		<MkFoldableSection class="item">
			<template #header>Deliver queue</template>
			<XQueue domain="deliver"/>
		</MkFoldableSection>

		<MkFoldableSection class="item">
			<template #header>Inbox queue</template>
			<XQueue domain="inbox"/>
		</MkFoldableSection>
	</div>
</div>
</template>

<script lang="ts" setup>
import { markRaw, onMounted, onBeforeUnmount, nextTick, computed } from 'vue';
import XInstances from './overview.instances.vue';
import XQueue from './overview.queue.vue';
import XModerators from './overview.moderators.vue';
import { useStream } from '@/stream.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import { genId } from '@/utility/id.js';

const queueStatsConnection = markRaw(useStream().useChannel('queueStats'));

onMounted(async () => {
	nextTick(() => {
		queueStatsConnection.send('requestLog', {
			id: genId(),
			length: 100,
		});
	});
});

onBeforeUnmount(() => {
	queueStatsConnection.dispose();
});

const headerActions = computed(() => []);

const headerTabs = computed(() => []);

definePage(() => ({
	title: i18n.ts.dashboard,
	icon: 'ti ti-dashboard',
}));
</script>

<style lang="scss" module>
.root {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(400px, 1fr));
	grid-gap: 16px;
}
</style>
