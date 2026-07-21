import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { DocsPage, type DocsPageProps } from 'fumadocs-ui/layouts/docs/page';
import type { Root } from 'fumadocs-core/page-tree';
import type { ReactNode } from 'react';
import { navigate } from 'astro:transitions/client';
import { RootProvider } from 'fumadocs-ui/provider/astro';
import type { AstroProviderProps } from 'fumadocs-core/framework/astro';
import SearchDialog from './SearchDialog';

export function Docs({
  tree,
  children,
  pathname,
  params,
  page,
}: {
  tree: Root;
  children: ReactNode;
  pathname: string;
  params: AstroProviderProps['params'];
  page?: DocsPageProps;
}) {
  return (
    <RootProvider
      pathname={pathname}
      params={params}
      navigate={navigate}
      theme={{ enabled: false }}
      search={{ SearchDialog }}
    >
      <DocsLayout
        tree={tree}
        themeSwitch={{ enabled: false }}
        nav={{
          title: (
            <span className="flex items-center gap-2 font-bold uppercase tracking-[0.14em]">
              <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true">
                <rect x="2.5" y="2.5" width="10" height="10" fill="#c8763c" />
                <rect
                  x="7.5"
                  y="7.5"
                  width="10"
                  height="10"
                  fill="none"
                  stroke="#c8763c"
                  strokeWidth="1.4"
                  opacity="0.55"
                />
              </svg>
              Shade
            </span>
          ),
          url: '/',
        }}
      >
        <DocsPage {...page}>{children}</DocsPage>
      </DocsLayout>
    </RootProvider>
  );
}
