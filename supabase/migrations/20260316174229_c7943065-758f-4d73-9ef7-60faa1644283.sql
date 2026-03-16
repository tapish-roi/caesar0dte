
-- Create app role enum
CREATE TYPE public.app_role AS ENUM ('mentor', 'student');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Create categories table (mentor creates these)
CREATE TABLE public.categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create lessons table
CREATE TABLE public.lessons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  lesson_type TEXT NOT NULL DEFAULT 'lesson' CHECK (lesson_type IN ('lesson', 'zoom_recording', 'resource')),
  video_url TEXT,
  thumbnail_url TEXT,
  duration_minutes INTEGER,
  position INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create community_invites table
CREATE TABLE public.community_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contact TEXT NOT NULL,
  student_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create community_members table
CREATE TABLE public.community_members (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (mentor_id, student_id)
);

-- Create community_posts table
CREATE TABLE public.community_posts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  mentor_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create lesson_progress table
CREATE TABLE public.lesson_progress (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  lesson_id UUID NOT NULL REFERENCES public.lessons(id) ON DELETE CASCADE,
  progress_percent INTEGER NOT NULL DEFAULT 0 CHECK (progress_percent >= 0 AND progress_percent <= 100),
  completed BOOLEAN NOT NULL DEFAULT false,
  last_watched_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE (student_id, lesson_id)
);

-- Enable Row Level Security on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lesson_progress ENABLE ROW LEVEL SECURITY;

-- Security definer function to check role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Security definer function to get user role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Function to check community membership
CREATE OR REPLACE FUNCTION public.is_community_member(_student_id UUID, _mentor_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE student_id = _student_id AND mentor_id = _mentor_id
  )
$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_lessons_updated_at BEFORE UPDATE ON public.lessons FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_invites_updated_at BEFORE UPDATE ON public.community_invites FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS Policies: profiles
CREATE POLICY "Users can view all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- RLS Policies: user_roles
CREATE POLICY "Users can view own role" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own role" ON public.user_roles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- RLS Policies: categories
CREATE POLICY "Mentors and members can view categories" ON public.categories FOR SELECT
  USING (public.has_role(auth.uid(), 'mentor') OR public.is_community_member(auth.uid(), mentor_id));
CREATE POLICY "Mentors can insert own categories" ON public.categories FOR INSERT WITH CHECK (auth.uid() = mentor_id AND public.has_role(auth.uid(), 'mentor'));
CREATE POLICY "Mentors can update own categories" ON public.categories FOR UPDATE USING (auth.uid() = mentor_id);
CREATE POLICY "Mentors can delete own categories" ON public.categories FOR DELETE USING (auth.uid() = mentor_id);

-- RLS Policies: lessons
CREATE POLICY "Published lessons visible to community" ON public.lessons FOR SELECT
  USING (
    (auth.uid() = mentor_id) OR
    (is_published = true AND public.is_community_member(auth.uid(), mentor_id))
  );
CREATE POLICY "Mentors can insert own lessons" ON public.lessons FOR INSERT WITH CHECK (auth.uid() = mentor_id AND public.has_role(auth.uid(), 'mentor'));
CREATE POLICY "Mentors can update own lessons" ON public.lessons FOR UPDATE USING (auth.uid() = mentor_id);
CREATE POLICY "Mentors can delete own lessons" ON public.lessons FOR DELETE USING (auth.uid() = mentor_id);

-- RLS Policies: community_invites
CREATE POLICY "Mentor and student can view invites" ON public.community_invites FOR SELECT
  USING (auth.uid() = mentor_id OR auth.uid() = student_id);
CREATE POLICY "Mentor can create invites" ON public.community_invites FOR INSERT WITH CHECK (auth.uid() = invited_by AND public.has_role(auth.uid(), 'mentor'));
CREATE POLICY "Student and mentor can update invite status" ON public.community_invites FOR UPDATE USING (auth.uid() = student_id OR auth.uid() = mentor_id);

-- RLS Policies: community_members
CREATE POLICY "Members can view community" ON public.community_members FOR SELECT
  USING (auth.uid() = mentor_id OR auth.uid() = student_id);
CREATE POLICY "Students can join community" ON public.community_members FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Mentor can remove members" ON public.community_members FOR DELETE USING (auth.uid() = mentor_id);

-- RLS Policies: community_posts
CREATE POLICY "Community members can view posts" ON public.community_posts FOR SELECT
  USING (auth.uid() = mentor_id OR public.is_community_member(auth.uid(), mentor_id));
CREATE POLICY "Mentor can create posts" ON public.community_posts FOR INSERT WITH CHECK (auth.uid() = mentor_id AND public.has_role(auth.uid(), 'mentor'));
CREATE POLICY "Mentor can update own posts" ON public.community_posts FOR UPDATE USING (auth.uid() = mentor_id);
CREATE POLICY "Mentor can delete own posts" ON public.community_posts FOR DELETE USING (auth.uid() = mentor_id);

-- RLS Policies: lesson_progress
CREATE POLICY "Students can view own progress" ON public.lesson_progress FOR SELECT USING (auth.uid() = student_id);
CREATE POLICY "Mentors can view students progress" ON public.lesson_progress FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.lessons WHERE id = lesson_id AND mentor_id = auth.uid())
);
CREATE POLICY "Students can insert own progress" ON public.lesson_progress FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY "Students can update own progress" ON public.lesson_progress FOR UPDATE USING (auth.uid() = student_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.email
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Match pending invites when student registers
CREATE OR REPLACE FUNCTION public.match_pending_invites()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.community_invites
  SET student_id = NEW.user_id
  WHERE contact = NEW.email AND student_id IS NULL AND status = 'pending';
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_profile_created_match_invites
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.match_pending_invites();

-- Storage bucket for lesson assets
INSERT INTO storage.buckets (id, name, public) VALUES ('lesson-assets', 'lesson-assets', true);
CREATE POLICY "Anyone can view lesson assets" ON storage.objects FOR SELECT USING (bucket_id = 'lesson-assets');
CREATE POLICY "Authenticated users can upload lesson assets" ON storage.objects FOR INSERT WITH CHECK (
  bucket_id = 'lesson-assets' AND auth.role() = 'authenticated'
);
CREATE POLICY "Owners can update lesson assets" ON storage.objects FOR UPDATE USING (
  bucket_id = 'lesson-assets' AND auth.uid()::text = (storage.foldername(name))[1]
);
CREATE POLICY "Owners can delete lesson assets" ON storage.objects FOR DELETE USING (
  bucket_id = 'lesson-assets' AND auth.uid()::text = (storage.foldername(name))[1]
);
