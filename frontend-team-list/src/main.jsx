import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, App as AntdApp } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import TeamListIsland from './TeamListIsland';
import './styles.css';

const rootElement = document.getElementById('teamListIslandRoot');
const bootstrapElement = document.getElementById('teamListBootstrap');

if (rootElement && bootstrapElement) {
  const bootstrap = JSON.parse(bootstrapElement.textContent || '{}');

  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ConfigProvider
        locale={zhCN}
        theme={{
          token: {
            colorPrimary: '#5b67f1',
            borderRadius: 14
          }
        }}
      >
        <AntdApp>
          <TeamListIsland bootstrap={bootstrap} />
        </AntdApp>
      </ConfigProvider>
    </React.StrictMode>
  );
}
