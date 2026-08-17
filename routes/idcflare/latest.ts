import type { Data, Route } from '@/types';
import { parseDate } from '@/utils/parse-date';

import { fetchJson, getCategoryMap, rootUrl } from './utils';

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

    const items = topic_list.topics.slice(0, limit).map((topic) => ({
        title: topic.title,
        link: `${rootUrl}/t/topic/${topic.id}`,
        pubDate: parseDate(topic.bumped_at),
        category: [
            ...(categoryMap.get(topic.category_id) ? [categoryMap.get(topic.category_id)] : []),
            ...(topic.tags ? topic.tags.map((tag) => tag.name) : []),
        ],
    }));

    return {
        title: 'IDC Flare - 最新话题',
        link: `${rootUrl}/latest`,
        item: items,
        language: 'zh-CN',
    };
}
