import type { MetadataRoute } from 'next'
import { fetchCourseSitemapEntries } from '@/lib/course-seo'
import { getSiteUrl } from '@/lib/site-url'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl()
  const courseEntries = await fetchCourseSitemapEntries()

  return [
    {
      url: `${siteUrl}/`,
      lastModified: new Date(),
    },
    {
      url: `${siteUrl}/courses`,
      lastModified: new Date(),
    },
    ...courseEntries.map((course) => ({
      url: `${siteUrl}/courses/${course.id}`,
      lastModified: new Date(course.updated_at),
    })),
  ]
}
