/**
 * hisotry/bookmark/setting modal
 */

import { pick } from 'lodash-es'
import { Tabs, Spin } from 'antd'
import { lazy, Suspense, useState, useEffect } from 'react'
import SettingModal from './setting-wrap'
import {
  settingMap,
  newBookmarkIdPrefix
} from '../../common/constants'
const TabBookmarks = lazy(() => import('./tab-bookmarks'))
const TabQuickCommands = lazy(() => import('./tab-quick-commands'))
const TabSettings = lazy(() => import('./tab-settings'))
const TabThemes = lazy(() => import('./tab-themes'))
const TabProfiles = lazy(() => import('./tab-profiles'))
const TabWidgets = lazy(() => import('./tab-widgets'))

const Loading = () => <div style={{ padding: 20, textAlign: 'center' }}><Spin /></div>

const e = window.translate

export default function SettingModalWrap (props) {
  // 显式订阅设置弹窗开关事件（manate auto 订阅在本组件失效的 workaround：
  // store.showModal 变化后 auto 未触发 reRender——用 window 事件 + forceUpdate 兜底）
  const [, force] = useState(0)
  useEffect(() => {
    const onChange = () => force(n => n + 1)
    window.addEventListener('easyssh:setting-modal', onChange)
    return () => window.removeEventListener('easyssh:setting-modal', onChange)
  }, [])
  const selectItem = (item) => {
    window.store.setSettingItem(item)
  }

  function renderTabs () {
    const { store } = props
    const tabsShouldConfirmDel = [
      settingMap.bookmarks,
      settingMap.terminalThemes
    ]
    const { settingTab, settingItem, settingSidebarList, bookmarkSelectMode } = store
    const props0 = {
      store,
      activeItemId: settingItem.id,
      type: settingTab,
      onClickItem: selectItem,
      shouldConfirmDel: tabsShouldConfirmDel.includes(settingTab),
      list: settingSidebarList
    }
    const { bookmarks, bookmarkGroups, widgetInstances } = store
    const formProps = {
      store,
      formData: settingItem,
      type: settingTab,
      hide: store.hideSettingModal,
      ...pick(store, [
        'currentBookmarkGroupId',
        'config'
      ]),
      bookmarkGroups,
      bookmarks,
      widgetInstancesLength: widgetInstances.length,
      serials: store.serials,
      loaddingSerials: store.loaddingSerials
    }
    const treeProps = {
      ...props0,
      bookmarkSelectMode,
      bookmarkGroups,
      bookmarkGroupTree: store.bookmarkGroupTree,
      bookmarksMap: store.bookmarksMap,
      bookmarks,
      ...pick(store, [
        'currentBookmarkGroupId',
        'config',
        'checkedKeys',
        'expandedKeys',
        'leftSidePanelWidth',
        'initLoadingData'
      ])
    }
    const items = [
      {
        key: settingMap.bookmarks,
        label: e(settingMap.bookmarks),
        children: null
      },
      {
        key: settingMap.setting,
        label: e(settingMap.setting),
        children: null
      },
      {
        key: settingMap.terminalThemes,
        label: e('uiThemes'),
        children: null
      },
      {
        key: settingMap.quickCommands,
        label: e(settingMap.quickCommands),
        children: null
      },
      {
        key: settingMap.profiles,
        label: e(settingMap.profiles),
        children: null
      },
      {
        key: settingMap.widgets,
        label: <>{e(settingMap.widgets)} <sup>Beta</sup></>,
        children: null
      }
    ]
    const tabsProps = {
      activeKey: settingTab,
      animated: false,
      items,
      onChange: store.handleChangeSettingTab,
      destroyOnHidden: true,
      className: 'setting-tabs',
      type: 'card'
    }
    return (
      <>
        <Tabs
          {...tabsProps}
        />
        <Suspense fallback={<Loading />}>
          <TabQuickCommands
            listProps={props0}
            settingItem={settingItem}
            formProps={formProps}
            store={store}
            settingTab={settingTab}
          />
          <TabBookmarks
            treeProps={treeProps}
            settingItem={settingItem}
            formProps={formProps}
            settingTab={settingTab}
          />
          <TabSettings
            listProps={props0}
            settingItem={settingItem}
            settingTab={settingTab}
            store={store}
          />
          <TabThemes
            listProps={props0}
            settingItem={settingItem}
            formProps={formProps}
            store={store}
            settingTab={settingTab}
          />
          <TabProfiles
            listProps={props0}
            settingItem={settingItem}
            formProps={formProps}
            store={store}
            settingTab={settingTab}
          />
          <TabWidgets
            listProps={props0}
            settingItem={settingItem}
            formProps={formProps}
            store={store}
            settingTab={settingTab}
          />
        </Suspense>
      </>
    )
  }

  const {
    showModal,
    hideSettingModal,
    innerWidth,
    useSystemTitleBar,
    settingTab,
    settingItem
  } = props.store
  const show = !!showModal
  const isNewConnection = settingTab === settingMap.bookmarks &&
    (settingItem.id || '').startsWith(newBookmarkIdPrefix)
  if (!show) {
    return null
  }
  return (
    <SettingModal
      onCancel={hideSettingModal}
      visible={show}
      useSystemTitleBar={useSystemTitleBar}
      innerWidth={innerWidth}
      isNewConnection={isNewConnection}
      isMobile={props.store.isMobile}
    >
      {renderTabs()}
    </SettingModal>
  )
}
