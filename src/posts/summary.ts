
// 'use strict';

import validator from 'validator';

import _ from 'lodash';

import topics from '../topics';
import user from '../user';
import plugins from '../plugins';
import categories from '../categories';
import utils from '../utils';

// import { Posts } from ;

module.exports = function (Posts) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    Posts.getPostSummaryByPids = async function (pids, uid, options) {
        if (!Array.isArray(pids) || !pids.length) {
            return [];
        }

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        options.stripTags = options.hasOwnProperty('stripTags') ? options.stripTags : false;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        options.parse = options.hasOwnProperty('parse') ? options.parse : true;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        options.extraFields = options.hasOwnProperty('extraFields') ? options.extraFields : [];

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const fields = ['pid', 'tid', 'content', 'uid', 'timestamp', 'deleted', 'upvotes', 'downvotes', 'replies', 'handle'].concat(options.extraFields);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        let posts = await Posts.getPostsFields(pids, fields) as any[];
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        posts = posts.filter(Boolean);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        posts = await user.blocks.filter(uid, posts) as any[];

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const uids = _.uniq(posts.map(p => p && p.uid));
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const tids = _.uniq(posts.map(p => p && p.tid));

        async function getTopicAndCategories(tids) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const topicsData = await topics.getTopicsFields(tids, [
                'uid', 'tid', 'title', 'cid', 'tags', 'slug',
                'deleted', 'scheduled', 'postcount', 'mainPid', 'teaserPid',
            ]);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const cids = _.uniq(topicsData.map(topic => topic && topic.cid));
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            const categoriesData: string[] = await categories.getCategoriesFields(cids, [
                'cid', 'name', 'icon', 'slug', 'parentCid',
                'bgColor', 'color', 'backgroundImage', 'imageClass',
            ]) as string[];
            return { topics: topicsData, categories: categoriesData };
        }

        const [users, topicsAndCategories] = await Promise.all([
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            user.getUsersFields(uids, ['uid', 'username', 'userslug', 'picture', 'status']),
            getTopicAndCategories(tids),
        ]);
        function toObject(key, data) {
            const obj = {};
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            for (let i = 0; i < data.length; i += 1) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                obj[data[i][key]] = data[i];
            }
            return obj;
        }

        const uidToUser = toObject('uid', users);
        const tidToTopic = toObject('tid', topicsAndCategories.topics);
        const cidToCategory = toObject('cid', topicsAndCategories.categories);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        posts.forEach((post) => {
            // If the post author isn't represented in the retrieved users' data,
            // then it means they were deleted, assume guest.
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            if (!uidToUser.hasOwnProperty(post.uid)) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                post.uid = 0;
            }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            post.user = uidToUser[post.uid];
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            Posts.overrideGuestHandle(post, post.handle);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            post.handle = undefined;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            post.topic = tidToTopic[post.tid];
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            post.category = post.topic && cidToCategory[post.topic.cid];
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            post.isMainPost = post.topic && post.pid === post.topic.mainPid;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            post.deleted = post.deleted === 1;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            post.timestampISO = utils.toISOString(post.timestamp);
        });

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        posts = posts.filter(post => tidToTopic[post.tid]);

        posts = await parsePosts(posts, options);
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        const result = await plugins.hooks.fire('filter:post.getPostSummaryByPids', { posts: posts, uid: uid });
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        return result.posts;
    };

    async function parsePosts(posts, options) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
        return await Promise.all(posts.map(async (post) => {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            if (!post.content || !options.parse) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
                post.content = post.content ? validator.escape(String(post.content)) : post.content;
                return post;
            }
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            post = await Posts.parsePost(post);
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            if (options.stripTags) {
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                post.content = stripTags(post.content);
            }
            return post;
        }));
    }

    function stripTags(content:string) {
        if (content) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
            return utils.stripHTMLTags(content, utils.stripTags);
        }
        return content;
    }
};
