// Portfolio content. Projects are imported live from the existing site's data
// module; the rest mirrors the content of the current About / Resume / Contact
// pages so v3 stays in sync with the real portfolio copy.

import { completedProjects, inProgressProjects } from '../../../src/data/projects.js'

export const projects = {
  completed: completedProjects,
  inProgress: inProgressProjects,
}

export const allProjects = [
  ...completedProjects.map((p) => ({ ...p, status: 'completed' })),
  ...inProgressProjects.map((p) => ({ ...p, status: 'in-progress' })),
]

export const identity = {
  name: 'Henry Li',
  aliases: ['Henry Li', 'himayetsu', 'henry li', 'himetsu'],
  subtitle: 'Software developer seeking bold opportunities',
  email: 'galacticfrosting@gmail.com',
}

export const about = {
  heading: 'Hello!',
  paragraphs: [
    "I'm a software developer currently studying Computer Engineering at the University of Waterloo with many years of experience in full stack development, graphics engineering, and optimization. My interests include Neural Networks, Game Development, and Simulations.",
    'I also enjoy doing writing, drawing art, and learning about cool physics/mathematics concepts that make the world feel precise.',
  ],
  tags: [
    'Full stack (React, Next.js)',
    'Graphics (OpenGL, Three.js)',
    'Machine learning (Tensorflow, PyTorch)',
    'Physics & Simulations',
    'Systems (C++, Rust)',
  ],
  skills: [
    { name: 'Java, Python, C++, C#, Javascript', level: 100, experience: '6+ years' },
    { name: 'HTML, CSS, WebGL, React, SQL', level: 70, experience: '4+ years' },
    { name: 'pytesseract, Three.js, Node.js', level: 55, experience: '3+ years' },
    { name: 'Typescript, SQL, OpenGL', level: 40, experience: '2+ years' },
    { name: 'Assembly, Golang, Swift, Tensorflow', level: 25, experience: '1+ years' },
  ],
  stats: [
    { label: 'Professional experience', value: '2+ years' },
    { label: 'Projects completed', value: String(completedProjects.length) },
  ],
}

export const experience = [
  {
    title: 'Full Stack Software Development Intern',
    company: 'eXp Realty',
    period: 'Jan 2026 - May 2026',
    description: 'stuff im adding later',
    tech: ['TypeScript', 'Golang', 'Node.js', 'Jest', 'Docket'],
  },
  {
    title: 'Software Engineering Intern',
    company: 'Upgraded Inc.',
    period: 'May 2025 - Sept 2025',
    description: 'more stuff im adding later',
    tech: ['React', 'Next.js', 'Node.js', 'Tailwind CSS'],
  },
  {
    title: 'Software Engineer',
    company: 'DataAnnotation',
    period: 'Apr 2024 - Sept 2024',
    description: 'even more stuff ill add later',
    tech: ['Java', 'C++', 'Python', 'Swift', 'Golang', 'Rust', 'SQL'],
  },
]

export const education = [
  {
    title: "Bachelor's degree in Computer Engineering",
    school: 'University of Waterloo',
    period: '2024 - 2029',
    description:
      'Notable courses: Algorithms and Data Structures, Advanced Calculus 1 for Electrical and Computer Engineers, Digital Computers, Electronic Circuits 1, Discrete Mathematics and Logic 1, Classical Mechanics',
  },
]

export const contact = {
  heading: "Let's create something amazing",
  blurb:
    "I'm always open to discussing new projects, creative ideas, or opportunities to be part of your vision.",
  prompt: 'Recruiter or want to work together? Email me!',
  email: 'galacticfrosting@gmail.com',
  socials: [
    { label: 'GitHub', href: '#' },
    { label: 'LinkedIn', href: '#' },
    { label: 'Instagram', href: '#' },
    { label: 'Discord', href: '#' },
    { label: 'LeetCode', href: '#' },
  ],
}
