import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Input, App as AntdApp } from 'antd'
import { LockOutlined, UserOutlined, EyeInvisibleOutlined, EyeOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { login } from '@/services/authService'
import { useUserStore } from '@/store/userStore'

/** 浮动粒子背景 */
function Particles() {
  const particles = Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    size: 2 + Math.random() * 4,
    delay: Math.random() * 15,
    duration: 12 + Math.random() * 15,
    opacity: 0.2 + Math.random() * 0.4,
  }))
  return (
    <>
      {particles.map((p) => (
        <div key={p.id} style={{
          position: 'absolute', left: `${p.left}%`, bottom: -10,
          width: p.size, height: p.size, borderRadius: '50%',
          background: '#60A5FA',
          opacity: p.opacity,
          animation: `rise ${p.duration}s linear ${p.delay}s infinite`,
        }} />
      ))}
    </>
  )
}

/** 数字滚动 */
function useCounter(target: number, duration = 1500) {
  const [val, setVal] = useState(0)
  useEffect(() => {
    let start: number | null = null
    let raf = 0
    const step = (ts: number) => {
      if (start === null) start = ts
      const p = Math.min((ts - start) / duration, 1)
      setVal(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, duration])
  return val
}

export function LoginPage() {
  const navigate = useNavigate()
  const setCurrentUser = useUserStore((s) => s.setCurrentUser)
  const { message } = AntdApp.useApp()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)

  const agents = useCounter(6)
  const roles = useCounter(3)
  const seconds = useCounter(24)

  async function onSubmit() {
    if (!username.trim() || !password) {
      message.warning('请填用户名和密码')
      return
    }
    setLoading(true)
    try {
      const r = await login(username, password)
      if (!r.ok || !r.user) {
        message.error(r.error ?? '登录失败')
        return
      }
      setCurrentUser(r.user)
      message.success(`欢迎回来，${r.user.name}`)
      const home: Record<string, string> = {
        admin: '/dashboard',
        finance_manager: '/workbench',
        accountant: '/voucher',
        cashier: '/cash',
        employee: '/quick',
      }
      navigate(home[r.user.role] ?? '/dashboard')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#030712',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif',
    }}>
      <style>{`
        @keyframes rise {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          10% { opacity: 0.6; }
          90% { opacity: 0.3; }
          100% { transform: translateY(-110vh) scale(0.5); opacity: 0; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pulse { 0%,100%{opacity:0.5} 50%{opacity:1} }
        @keyframes shimmer {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .fade-up { animation: fadeUp 0.7s ease-out both; }
        .fade-up-1 { animation-delay: 0.1s; }
        .fade-up-2 { animation-delay: 0.25s; }
        .fade-up-3 { animation-delay: 0.4s; }
        .title-gradient {
          background: linear-gradient(90deg, #60A5FA, #A78BFA, #F472B6, #60A5FA);
          background-size: 300% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: shimmer 6s linear infinite;
        }
      `}</style>

      {/* 背景：旋转渐变光斑 */}
      <div style={{
        position: 'absolute', inset: '-20%',
        background:
          'radial-gradient(circle at 20% 30%, rgba(27,95,227,0.35) 0%, transparent 40%),' +
          'radial-gradient(circle at 80% 70%, rgba(123,47,190,0.3) 0%, transparent 40%),' +
          'radial-gradient(circle at 50% 100%, rgba(0,194,255,0.25) 0%, transparent 40%),' +
          'radial-gradient(circle at 90% 20%, rgba(244,114,182,0.15) 0%, transparent 40%)',
        animation: 'spin 40s linear infinite',
      }} />

      {/* 网格 */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'linear-gradient(rgba(96,165,250,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(96,165,250,0.07) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
        maskImage: 'radial-gradient(ellipse at center, black 20%, transparent 70%)',
        WebkitMaskImage: 'radial-gradient(ellipse at center, black 20%, transparent 70%)',
      }} />

      <Particles />

      {/* 主内容 */}
      <div style={{
        position: 'relative', zIndex: 1,
        display: 'grid',
        gridTemplateColumns: '1.1fr 0.9fr',
        gap: 48,
        width: 'min(1100px, 92vw)',
        alignItems: 'center',
      }}>
        {/* 左侧：品牌主张 */}
        <div className="fade-up">
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 14px', borderRadius: 999,
            background: 'rgba(96,165,250,0.1)',
            border: '1px solid rgba(96,165,250,0.25)',
            color: '#93C5FD', fontSize: 12, marginBottom: 28,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', animation: 'pulse 2s infinite' }} />
            AI 财务团队 · 数据本地存储
          </div>
          <h1 style={{
            color: 'white', fontSize: 52, lineHeight: 1.15, margin: 0, fontWeight: 800,
            letterSpacing: '-1px',
          }}>
            一个账本<br />
            <span className="title-gradient">三个角色视角</span><br />
            全员自动协同
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 16, marginTop: 24, lineHeight: 1.8, maxWidth: 480 }}>
            老板看驾驶舱 · 财务批数字员工的活 · 业务说一句就记账。<br />
            AI 可选，手动保底，数据不出你的设备。
          </p>
          {/* 数字 */}
          <div style={{ display: 'flex', gap: 40, marginTop: 40 }}>
            <div>
              <div style={{ color: 'white', fontSize: 36, fontWeight: 800 }}>{agents}</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }}>数字员工</div>
            </div>
            <div>
              <div style={{ color: 'white', fontSize: 36, fontWeight: 800 }}>{roles}</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }}>层角色视图</div>
            </div>
            <div>
              <div style={{ color: 'white', fontSize: 36, fontWeight: 800 }}>{seconds}h</div>
              <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 4 }}>周度自动体检</div>
            </div>
          </div>
        </div>

        {/* 右侧：登录卡片 */}
        <div className="fade-up fade-up-2" style={{
          background: 'rgba(15,23,42,0.6)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 20,
          padding: 40,
          boxShadow: '0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.08)',
        }}>
          <div className="fade-up fade-up-3">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: 'linear-gradient(135deg, #1B5FE3, #7B2FBE)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 8px 20px rgba(27,95,227,0.5)',
              }}>
                <ThunderboltOutlined style={{ color: 'white', fontSize: 20 }} />
              </div>
              <div>
                <div style={{ color: 'white', fontSize: 18, fontWeight: 700 }}>云财管家</div>
                <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>登录进入你的财务团队</div>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 28 }}>
              <Input
                size="large" placeholder="用户名" prefix={<UserOutlined style={{ color: 'rgba(255,255,255,0.35)' }} />}
                value={username} onChange={(e) => setUsername(e.target.value)}
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white', height: 48,
                }}
                onPressEnter={onSubmit}
              />
              <Input.Password
                size="large" placeholder="密码" prefix={<LockOutlined style={{ color: 'rgba(255,255,255,0.35)' }} />}
                type={showPwd ? 'text' : 'password'}
                iconRender={(v) => v ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                value={password} onChange={(e) => setPassword(e.target.value)}
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', height: 48 }}
                onPressEnter={onSubmit}
              />
              <Button
                type="primary" size="large" loading={loading} onClick={onSubmit}
                style={{
                  background: 'linear-gradient(90deg, #1B5FE3, #7B2FBE)',
                  border: 'none', height: 48, fontWeight: 600, fontSize: 15,
                  boxShadow: '0 8px 24px rgba(27,95,227,0.5)',
                }}
              >
                进入系统
              </Button>
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, textAlign: 'center', marginTop: 4 }}>
                管理员账号由系统管理员分配 · 初始密码 12345678
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
