import type { Data, Route } from '@/types';
import { parseDate } from '@/utils/parse-date';

import { createFetch, getCategoryMap, rootUrl } from './utils';

export const route: Route = {
    path: '/top/:period?',
    categories: ['bbs'],
    example: '/idcflare/top/weekly',
    parameters: { period: '时间范围：all, yearly, quarterly, monthly, weekly, daily。默认为 `weekly`' },
    name: '热门话题',
    maintainers: [],
    handler,
};

async function handler(ctx): Promise<Data> {
    const { period = 'weekly' } = ctx.req.param();
    const limit = ctx.req.query('limit') ? Number.parseInt(ctx.req.query('limit')) : 30;

    const { topic_list } = await createFetch(`/top.json?period=${period}`);
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
        title: `IDC Flare - 热门话题 (${period})`,
        link: `${rootUrl}/top?period=${period}`,
        item: items,
        language: 'zh-CN',
    };
}
