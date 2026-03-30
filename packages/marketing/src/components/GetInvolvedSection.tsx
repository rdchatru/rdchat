/*
 * Copyright (C) 2026 Fluxer Contributors
 *
 * This file is part of Fluxer.
 *
 * Fluxer is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * Fluxer is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with Fluxer. If not, see <https://www.gnu.org/licenses/>.
 */

/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */

import {Section} from '@fluxer/marketing/src/components/Section';
import {SupportCard} from '@fluxer/marketing/src/components/SupportCard';
import type {MarketingContext} from '@fluxer/marketing/src/MarketingContext';
import {docsUrl} from '@fluxer/marketing/src/UrlUtils';

interface GetInvolvedSectionProps {
	ctx: MarketingContext;
}

export function GetInvolvedSection(props: GetInvolvedSectionProps): JSX.Element {
	const {ctx} = props;

	return (
		<Section
			variant="light"
			title={ctx.i18n.getMessage('company_and_resources.source_and_contribution.get_involved', ctx.locale)}
			description={ctx.i18n.getMessage(
				'company_and_resources.source_and_contribution.fluxer_built_in_open',
				ctx.locale,
			)}
			className="md:py-28"
			id="get-involved"
		>
			<div class="grid grid-cols-1 gap-8 md:grid-cols-2 md:gap-10">
				<SupportCard
					ctx={ctx}
					icon="chat_centered_text"
					title="RdChat HQ"
					description={ctx.i18n.getMessage('misc_labels.get_updates', ctx.locale)}
					buttonText="Join RdChat HQ"
					buttonHref="https://rdchat.ru/invite/hq"
					theme="light"
				/>
				<SupportCard
					ctx={ctx}
					icon="server"
					title={ctx.i18n.getMessage('company_and_resources.docs', ctx.locale)}
					description="Read the docs, release notes, and setup guides for the project."
					buttonText={ctx.i18n.getMessage('misc_labels.learn_more', ctx.locale)}
					buttonHref={docsUrl()}
					theme="light"
				/>
				<SupportCard
					ctx={ctx}
					icon="bug"
					title={ctx.i18n.getMessage('misc_labels.report_bugs', ctx.locale)}
					description={ctx.i18n.getMessage('security.testers_access_from_reports', ctx.locale)}
					buttonText={ctx.i18n.getMessage('misc_labels.read_the_guide', ctx.locale)}
					buttonHref="/help/report-bug"
					theme="light"
				/>
				<SupportCard
					ctx={ctx}
					icon="code"
					title={ctx.i18n.getMessage('company_and_resources.source_and_contribution.contribute_code', ctx.locale)}
					description={ctx.i18n.getMessage('product_positioning.open_source.fully_open_source_agplv3', ctx.locale)}
					buttonText={ctx.i18n.getMessage('company_and_resources.source_and_contribution.view_repository', ctx.locale)}
					buttonHref="https://github.com/fluxerapp/fluxer"
					theme="light"
				/>
			</div>
		</Section>
	);
}
