import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff, TrendingUp } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Register() {
    const { register } = useAuth();
    const navigate = useNavigate();
    const [form, setForm] = useState({ email: '', password: '', confirmPassword: '', firstName: '', lastName: '' });
    const [showPass, setShowPass] = useState(false);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        if (form.password !== form.confirmPassword) {
            setError('Passwords do not match');
            return;
        }
        if (form.password.length < 8) {
            setError('Password must be at least 8 characters');
            return;
        }
        setLoading(true);
        try {
            await register(form.email, form.password, form.firstName, form.lastName);
            navigate('/');
        } catch (err) {
            setError(err.message || 'Registration failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[calc(100vh-4rem)] px-4 py-10 flex items-center justify-center">
            <div className="w-full max-w-6xl grid lg:grid-cols-[1.1fr_0.9fr] gap-6">
                <div className="hidden lg:flex rounded-3xl border border-gray-200 bg-white p-10 shadow-sm dark:border-[#202832] dark:bg-[#0a0e13] flex-col justify-between">
                    <div>
                        <div className="w-14 h-14 rounded-2xl bg-[#22324a] border border-[#314766] flex items-center justify-center mb-6 shadow-sm">
                            <TrendingUp size={28} className="text-white" />
                        </div>
                        <p className="text-[11px] uppercase tracking-[0.24em] text-gray-400 dark:text-slate-500 font-bold mb-3">Create Workspace</p>
                        <h1 className="text-4xl font-bold text-gray-900 dark:text-slate-50 leading-tight mb-4">Set up your market tracking desk.</h1>
                        <p className="text-base text-gray-600 dark:text-slate-400 max-w-lg">
                            Build a single workspace for watchlists, performance tracking and broker imports without the usual UI noise.
                        </p>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                        <AuthStat label="Track" value="Portfolio" />
                        <AuthStat label="Sync" value="eToro / XTB" />
                        <AuthStat label="Compare" value="vs S&P 500" />
                    </div>
                </div>

                <div className="rounded-3xl border border-gray-200 bg-white p-8 shadow-sm dark:border-[#202832] dark:bg-[#0a0e13]">
                    <div className="mb-8">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-gray-400 dark:text-slate-500 font-bold mb-3">Register</div>
                        <h2 className="text-3xl font-bold text-gray-900 dark:text-slate-50">Create your account</h2>
                        <p className="text-sm text-gray-500 dark:text-slate-400 mt-2">Open your workspace in less than a minute.</p>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-2 gap-3">
                            <Field label="First Name">
                                <User size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                                <input type="text" value={form.firstName} onChange={update('firstName')} className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-3 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-[#202832] dark:bg-[#0f151d] dark:text-slate-100" placeholder="John" />
                            </Field>
                            <Field label="Last Name">
                                <input type="text" value={form.lastName} onChange={update('lastName')} className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-[#202832] dark:bg-[#0f151d] dark:text-slate-100" placeholder="Doe" />
                            </Field>
                        </div>

                        <Field label="Email">
                            <Mail size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                            <input type="email" value={form.email} onChange={update('email')} className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-3 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-[#202832] dark:bg-[#0f151d] dark:text-slate-100" placeholder="you@example.com" required />
                        </Field>

                        <Field label="Password">
                            <Lock size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                            <input type={showPass ? 'text' : 'password'} value={form.password} onChange={update('password')} className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-10 py-3 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-[#202832] dark:bg-[#0f151d] dark:text-slate-100" placeholder="Minimum 8 characters" required />
                            <button type="button" onClick={() => setShowPass(!showPass)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500">
                                {showPass ? <EyeOff size={17} /> : <Eye size={17} />}
                            </button>
                        </Field>

                        <Field label="Confirm Password">
                            <Lock size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                            <input type="password" value={form.confirmPassword} onChange={update('confirmPassword')} className="w-full rounded-xl border border-gray-200 bg-white pl-10 pr-4 py-3 text-sm text-gray-900 outline-none focus:border-blue-500 dark:border-[#202832] dark:bg-[#0f151d] dark:text-slate-100" placeholder="Repeat password" required />
                        </Field>

                        <button type="submit" disabled={loading} className="w-full py-3 rounded-xl bg-[#22324a] hover:bg-[#2a3d5a] text-white font-bold transition-colors disabled:opacity-50">
                            {loading ? <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mx-auto" /> : 'Create Account'}
                        </button>
                    </form>

                    <div className="flex items-center gap-3 my-6">
                        <div className="flex-1 h-px bg-gray-200 dark:bg-[#202832]" />
                        <span className="text-[11px] uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500">Or</span>
                        <div className="flex-1 h-px bg-gray-200 dark:bg-[#202832]" />
                    </div>

                    <a
                        href="/accounts/google/login/?next=/dashboard"
                        className="flex items-center justify-center gap-3 w-full py-3 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 transition-colors dark:border-[#202832] dark:text-slate-200 dark:hover:bg-[#111723]"
                    >
                        <GoogleIcon />
                        <span className="font-semibold text-sm">Continue with Google</span>
                    </a>

                    <p className="text-center text-sm text-gray-500 dark:text-slate-400 mt-6">
                        Already have an account?{' '}
                        <Link to="/login" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
                            Sign in
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }) {
    return (
        <div>
            <label className="block text-[11px] uppercase tracking-[0.18em] text-gray-500 dark:text-slate-500 font-bold mb-2">{label}</label>
            <div className="relative">{children}</div>
        </div>
    );
}

function AuthStat({ label, value }) {
    return (
        <div className="rounded-2xl border border-gray-200 dark:border-[#202832] bg-gray-50 dark:bg-[#0f151d] px-4 py-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-gray-400 dark:text-slate-500 font-bold mb-2">{label}</div>
            <div className="text-sm font-semibold text-gray-900 dark:text-slate-100">{value}</div>
        </div>
    );
}

function GoogleIcon() {
    return (
        <svg width="18" height="18" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
        </svg>
    );
}
