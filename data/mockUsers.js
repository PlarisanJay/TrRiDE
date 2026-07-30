let users = [
  {
    id: '9',
    name: 'Admin User',
    email: 'admin@gmail.com',
    phone: '+1 (555) 000-0000',
    role: 'admin',
    status: 'approved',
    registeredAt: '2026-01-01',
  },
  {
    id: '1',
    name: 'Alex Rodriguez',
    email: 'alex@university.edu',
    phone: '+1 (555) 123-4567',
    role: 'student',
    status: 'approved',
    registeredAt: '2026-01-15',
    studentId: 'STU-2024-001',
    university: 'State University',
    course: 'Computer Science',
    yearLevel: '3rd Year',
  },
  {
    id: '2',
    name: 'Maria Santos',
    email: 'maria@university.edu',
    phone: '+1 (555) 234-5678',
    role: 'student',
    status: 'approved',
    registeredAt: '2026-01-18',
    studentId: 'STU-2024-002',
    university: 'State University',
    course: 'Nursing',
    yearLevel: '2nd Year',
  },
  {
    id: '3',
    name: 'James Chen',
    email: 'james@university.edu',
    phone: '+1 (555) 345-6789',
    role: 'student',
    status: 'approved',
    registeredAt: '2026-01-20',
    studentId: 'STU-2024-003',
    university: 'Tech Institute',
    course: 'Engineering',
    yearLevel: '4th Year',
  },
  {
    id: '4',
    name: 'Carlos Rivera',
    email: 'carlos@triride.com',
    phone: '+1 (555) 456-7890',
    role: 'driver',
    status: 'approved',
    registeredAt: '2026-01-10',
    licenseNo: 'DL-2024-0881',
    vehicleType: 'Tricycle',
    plateNumber: 'ABC 1234',
    licenseExpiry: '2027-01-15',
  },
  {
    id: '5',
    name: 'Juan Dela Cruz',
    email: 'juan@triride.com',
    phone: '+1 (555) 567-8901',
    role: 'driver',
    status: 'approved',
    registeredAt: '2026-01-12',
    licenseNo: 'DL-2024-0882',
    vehicleType: 'Tricycle',
    plateNumber: 'DEF 5678',
    licenseExpiry: '2027-06-20',
  },
  {
    id: '6',
    name: 'Sarah Kim',
    email: 'sarah@university.edu',
    phone: '+1 (555) 678-9012',
    role: 'student',
    status: 'pending',
    registeredAt: '2026-07-14',
    studentId: 'STU-2026-019',
    university: 'State University',
    course: 'Business Administration',
    yearLevel: '1st Year',
  },
  {
    id: '7',
    name: 'Miguel Torres',
    email: 'miguel@triride.com',
    phone: '+1 (555) 789-0123',
    role: 'driver',
    status: 'pending',
    registeredAt: '2026-07-15',
    licenseNo: 'DL-2026-1201',
    vehicleType: 'Motorcycle',
    plateNumber: 'GHI 9012',
    licenseExpiry: '2028-03-10',
  },
  {
    id: '8',
    name: 'David Park',
    email: 'david@triride.com',
    phone: '+1 (555) 890-1234',
    role: 'driver',
    status: 'pending',
    registeredAt: '2026-07-16',
    licenseNo: 'DL-2026-1202',
    vehicleType: 'Tricycle',
    plateNumber: 'JKL 3456',
    licenseExpiry: '2028-05-25',
  },
];

let nextId = 9;

export const getPendingRegistrations = () => {
  return users.filter((u) => u.status === 'pending');
};

export const approveUser = (id) => {
  users = users.map((u) => (u.id === id ? { ...u, status: 'approved' } : u));
};

export const rejectUser = (id) => {
  users = users.map((u) => (u.id === id ? { ...u, status: 'rejected' } : u));
};

export const getAllUsers = () => {
  return [...users];
};

export const getUserByEmail = (email) => {
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
};

export const addUser = (userData) => {
  const newUser = {
    id: String(nextId++),
    ...userData,
    status: 'pending',
    registeredAt: new Date().toISOString().split('T')[0],
  };
  users = [...users, newUser];
  return newUser;
};

export const getUserStats = () => {
  const total = users.filter((u) => u.status === 'approved').length;
  const pending = users.filter((u) => u.status === 'pending').length;
  const students = users.filter((u) => u.role === 'student' && u.status === 'approved').length;
  const drivers = users.filter((u) => u.role === 'driver' && u.status === 'approved').length;
  return { total, pending, students, drivers };
};
