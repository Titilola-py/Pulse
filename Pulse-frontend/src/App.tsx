import { Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import RequireAdmin from './components/RequireAdmin'
import RequireAuth from './components/RequireAuth'
import AdminUsers from './pages/AdminUsers'
import ConversationDetail from './pages/ConversationDetail'
import Conversations from './pages/Conversations'
import ConversationsEmpty from './pages/ConversationsEmpty'
import ForgotPassword from './pages/ForgotPassword'
import Home from './pages/Home'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Profile from './pages/Profile'
import Register from './pages/Register'
import ResetPassword from './pages/ResetPassword'
import Support from './pages/Support'

export default function App() {
  return (
    <div className="app">
      <Header />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/support" element={<Support />} />
          <Route element={<RequireAuth />}>
            <Route path="/profile" element={<Profile />} />
            <Route path="/conversations" element={<Conversations />}>
              <Route index element={<ConversationsEmpty />} />
              <Route path=":id" element={<ConversationDetail />} />
            </Route>
            <Route element={<RequireAdmin />}>
              <Route path="/admin/users" element={<AdminUsers />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  )
}
