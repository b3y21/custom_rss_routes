import type { Data, Route } from '@/types';

import { fetchJson, getCategoryMap, getTopicItems, rootUrl } from './utils';

export const route: Route = {
    path: '/latest',
    categories: ['bbs'],
    example: '/idcflare/latest',
    radar: [
        {
            source: ['idcflare.com/'],
            target: '/latest',
        },
    ],
    name: '最新话题',
    maintainers: [],
    features: {
        requirePuppeteer: true,
        antiCrawler: true,
    },
    handler,
};

async function handler(ctx): Promise<Data> {
    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 30;

    const { topic_list } = await fetchJson('/latest.json');
    const categoryMap = await getCategoryMap();

    const items = await getTopicItems(topic_list.topics.slice(0, limit), categoryMap);

    return {
        title: 'IDC Flare - 最新话题',
        link: `${rootUrl}/latest`,
        item: items,
        language: 'zh-CN',
    };
}
