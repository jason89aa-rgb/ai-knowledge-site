import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

const postsDirectory = path.join(process.cwd(), 'posts');

export function getCategories() {
  const categories = fs.readdirSync(postsDirectory);
  return categories.filter(category => fs.statSync(path.join(postsDirectory, category)).isDirectory());
}

export function getPostsByCategory(category: string) {
  const categoryDirectory = path.join(postsDirectory, category);
  const fileNames = fs.readdirSync(categoryDirectory);
  const allPostsData = fileNames.map(fileName => {
    const slug = fileName.replace(/\.mdx$/, '');
    const fullPath = path.join(categoryDirectory, fileName);
    const fileContents = fs.readFileSync(fullPath, 'utf8');
    const matterResult = matter(fileContents);

    return {
      slug,
      category,
      ...(matterResult.data as { title: string; date: string }),
    };
  });

  return allPostsData.sort((a, b) => {
    if (a.date < b.date) {
      return 1;
    } else {
      return -1;
    }
  });
}

export async function getPostData(category: string, slug: string) {
  const fullPath = path.join(postsDirectory, category, `${slug}.mdx`);
  const fileContents = fs.readFileSync(fullPath, 'utf8');

  const matterResult = matter(fileContents);

  return {
    slug,
    category,
    content: matterResult.content,
    ...(matterResult.data as { title: string; date: string }),
  };
}

export function getAllPostParams() {
  const categories = getCategories();
  const allParams = categories.flatMap(category => {
    const posts = getPostsByCategory(category);
    return posts.map(post => ({
      category: category,
      slug: post.slug,
    }));
  });
  return allParams;
}
