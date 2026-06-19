<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div class="_spacer" style="--MI_SPACER-w: 700px;">
	<div class="_gaps">
		<MkFoldableSection class="item">
			<template #header><i class="ti ti-activity"></i> Heatmap</template>
			<MkHeatmap :user="user" :src="'notes'"/>
		</MkFoldableSection>
	</div>
</div>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import MkFoldableSection from '@/components/MkFoldableSection.vue';
import MkHeatmap from '@/components/MkHeatmap.vue';

const props = defineProps<{
	user: Misskey.entities.User;
}>();

</script>
