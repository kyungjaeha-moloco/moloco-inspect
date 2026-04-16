import type { CanvasNode, CanvasEdge, ScreenComponent } from './types';

export const sampleNodes: CanvasNode[] = [
  {
    id: 'section-1',
    type: 'section',
    position: { x: 0, y: 0 },
    style: { width: 1200, height: 600 },
    data: {
      name: '캠페인 생성 플로우',
      color: '#346bea',
    },
  },
  {
    id: 'screen-1',
    type: 'screen',
    position: { x: 40, y: 60 },
    width: 320,
    height: 400,
    parentId: 'section-1',
    expandParent: true,
    data: {
      name: 'Step 1: 캠페인 정보 입력',
      width: 320,
      height: 400,
      zIndex: 1,
      locked: false,
    },
  },
  {
    id: 'screen-2',
    type: 'screen',
    position: { x: 440, y: 60 },
    width: 320,
    height: 400,
    parentId: 'section-1',
    expandParent: true,
    data: {
      name: 'Step 2: 타겟팅 설정',
      width: 320,
      height: 400,
      zIndex: 1,
      locked: false,
    },
  },
  {
    id: 'screen-3',
    type: 'screen',
    position: { x: 840, y: 60 },
    width: 320,
    height: 300,
    parentId: 'section-1',
    expandParent: true,
    data: {
      name: 'Step 3: 완료',
      width: 320,
      height: 300,
      zIndex: 1,
      locked: false,
    },
  },
  {
    id: 'section-tving',
    type: 'section',
    position: { x: 0, y: 750 },
    style: { width: 900, height: 600 },
    data: { name: 'TVING 로그인 플로우', color: '#e5234c' },
  },
  {
    id: 'screen-login',
    type: 'screen',
    position: { x: 40, y: 60 },
    width: 800,
    height: 500,
    parentId: 'section-tving',
    expandParent: true,
    data: {
      name: 'TVING 로그인',
      width: 800,
      height: 500,
      zIndex: 1,
      locked: false,
      customHtml: `<div style="display:flex;height:100%;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="width:45%;background:linear-gradient(135deg,#e5234c 0%,#d41e3c 30%,#c0192f 60%,#e5234c 100%);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;">
    <div style="position:absolute;top:-50px;left:-80px;width:300px;height:500px;background:rgba(255,255,255,0.08);transform:rotate(20deg);border-radius:20px;"></div>
    <div style="position:absolute;bottom:-100px;right:-60px;width:350px;height:400px;background:rgba(255,255,255,0.06);transform:rotate(-15deg);border-radius:20px;"></div>
    <div style="position:absolute;top:100px;right:20px;width:200px;height:350px;background:rgba(255,255,255,0.04);transform:rotate(30deg);border-radius:15px;"></div>
    <span style="color:white;font-size:36px;font-weight:900;letter-spacing:4px;z-index:1;">TVING</span>
  </div>
  <div style="width:55%;background:white;display:flex;align-items:center;justify-content:center;padding:40px;">
    <div style="width:100%;max-width:320px;">
      <h1 style="font-size:24px;font-weight:700;color:#1a1a1a;margin:0 0 32px 0;">로그인</h1>
      <div style="margin-bottom:20px;">
        <label style="display:block;font-size:13px;font-weight:600;color:#333;margin-bottom:8px;">이메일</label>
        <div style="border:1px solid #d0d0d0;border-radius:6px;padding:12px 14px;font-size:14px;color:#999;">이메일 주소를 입력해 주세요.</div>
      </div>
      <div style="margin-bottom:24px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
          <label style="font-size:13px;font-weight:600;color:#333;">비밀번호</label>
          <span style="font-size:12px;color:#346bea;cursor:pointer;">비밀번호를 잊으셨나요?</span>
        </div>
        <div style="border:1px solid #d0d0d0;border-radius:6px;padding:12px 14px;font-size:14px;color:#999;">비밀번호를 입력해주세요.</div>
      </div>
      <div style="background:#346bea;color:white;text-align:center;padding:14px;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer;">로그인</div>
    </div>
  </div>
</div>`,
    },
  },
];

export const sampleEdges: CanvasEdge[] = [
  {
    id: 'edge-1-2',
    source: 'screen-1',
    target: 'screen-2',
    type: 'flow',
    data: { label: '다음' },
  },
  {
    id: 'edge-2-3',
    source: 'screen-2',
    target: 'screen-3',
    type: 'flow',
    data: { label: '완료' },
  },
];

const now = new Date().toISOString();

export const sampleComponents: Record<string, ScreenComponent> = {
  'comp-1': {
    id: 'comp-1',
    screenId: 'screen-1',
    parentId: null,
    childIds: [],
    type: 'MCFormTextInput',
    props: {},
    order: 0,
    createdAt: now,
  },
  'comp-2': {
    id: 'comp-2',
    screenId: 'screen-1',
    parentId: null,
    childIds: [],
    type: 'MCFormTextArea',
    props: {},
    order: 1,
    createdAt: now,
  },
  'comp-3': {
    id: 'comp-3',
    screenId: 'screen-1',
    parentId: null,
    childIds: [],
    type: 'MCButton2',
    props: { variant: 'contained' },
    order: 2,
    createdAt: now,
  },
  'comp-4': {
    id: 'comp-4',
    screenId: 'screen-2',
    parentId: null,
    childIds: [],
    type: 'MCFormCheckBox',
    props: {},
    order: 0,
    createdAt: now,
  },
  'comp-5': {
    id: 'comp-5',
    screenId: 'screen-2',
    parentId: null,
    childIds: [],
    type: 'MCFormSwitchInput',
    props: {},
    order: 1,
    createdAt: now,
  },
  'comp-6': {
    id: 'comp-6',
    screenId: 'screen-3',
    parentId: null,
    childIds: [],
    type: 'MCStatus',
    props: { status: 'positive' },
    order: 0,
    createdAt: now,
  },
  'comp-7': {
    id: 'comp-7',
    screenId: 'screen-3',
    parentId: null,
    childIds: [],
    type: 'MCButton2',
    props: { variant: 'outlined' },
    order: 1,
    createdAt: now,
  },
};
