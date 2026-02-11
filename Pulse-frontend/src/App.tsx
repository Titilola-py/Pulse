import { Route, Routes } from 'react-router-dom'
import Header from './components/Header'
import RequireAuth from './components/RequireAuth'
import ConversationDetail from './pages/ConversationDetail'
import Conversations from './pages/Conversations'
import ConversationsEmpty from './pages/ConversationsEmpty'
import Home from './pages/Home'
import Login from './pages/Login'
import NotFound from './pages/NotFound'
import Profile from './pages/Profile'
import Register from './pages/Register'
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
          <Route path="/support" element={<Support />} />
          <Route element={<RequireAuth />}>
            <Route path="/profile" element={<Profile />} />
            <Route path="/conversations" element={<Conversations />}>
              <Route index element={<ConversationsEmpty />} />
              <Route path=":id" element={<ConversationDetail />} />
            </Route>
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  )
}
