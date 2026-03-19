// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
	site: 'https://averspec.dev',
	integrations: [
		starlight({
			title: 'Aver',
			social: [
				{ icon: 'github', label: 'GitHub', href: 'https://github.com/averspec/aver' },
			],
			customCss: ['./src/styles/custom.css'],
			head: [
				{
					tag: 'script',
					content: `document.addEventListener('DOMContentLoaded',()=>{document.querySelectorAll('a[href^="http"]').forEach(a=>{if(!a.hostname.includes(location.hostname)){a.setAttribute('target','_blank');a.setAttribute('rel','noopener')}})})`,
				},
				...(import.meta.env.PROD && process.env.POSTHOG_API_KEY
					? [
							{
								tag: 'script',
								content: `
									!function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init push capture register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
									posthog.init('${process.env.POSTHOG_API_KEY}', {api_host: 'https://us.i.posthog.com', person_profiles: 'identified_only'});
								`,
							},
						]
					: []),
			],
			sidebar: [
				{ label: 'Home', slug: '' },
				{ label: 'Getting Started', slug: 'guides/getting-started' },
				{
					label: 'Tutorials',
					items: [
						{ label: 'Legacy Code', slug: 'tutorial' },
						{ label: 'Greenfield', slug: 'tutorial-greenfield' },
						{ label: 'Telemetry Verification', slug: 'tutorial-telemetry' },
					],
				},
				{
					label: 'Guides',
					items: [
						{ label: 'Multi-Adapter Testing', slug: 'guides/multi-adapter' },
						{ label: 'Approval Testing', slug: 'guides/approvals' },
						{ label: 'Telemetry', slug: 'guides/telemetry' },
						{ label: 'CI Integration', slug: 'guides/ci-integration' },
						{ label: 'Test Styles', slug: 'guides/test-styles' },
						{ label: 'Example App', slug: 'guides/example-app' },
						{ label: 'When to Use & Troubleshooting', slug: 'guides/troubleshooting' },
					],
				},
				{
					label: 'Methodology',
					collapsed: true,
					items: [
						{ label: 'Example Mapping', slug: 'guides/example-mapping' },
						{ label: 'Scenario Pipeline', slug: 'guides/scenario-pipeline' },
						{ label: 'AI-Assisted Testing', slug: 'guides/ai-assisted' },
					],
				},
				{
					label: 'Reference',
					items: [
						{ label: 'API', slug: 'api' },
						{ label: 'Architecture', slug: 'architecture' },
						{ label: 'Glossary', slug: 'glossary' },
					],
				},
				{
					label: 'Articles',
					collapsed: true,
					items: [
						{ label: 'Introducing Aver', slug: 'articles/introducing-aver' },
						{ label: "The Tests You're Afraid to Refactor", slug: 'articles/tests-afraid-to-refactor' },
						{ label: 'Your Adapter Is a Design Review', slug: 'articles/adapter-driven-design' },
						{ label: "The Foundation Nobody's Building", slug: 'articles/the-foundation' },
						{ label: 'Stop Reviewing AI Code', slug: 'articles/stop-reviewing' },
					],
				},
			],
		}),
	],
});
