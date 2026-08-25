import { supabase } from './src/config/supabase';

async function main() {
  console.log('Truncating fake sweeps from Supabase...');
  const { error } = await supabase.from('sweeps').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  if (error) {
    console.error('Delete error:', error);
  } else {
    console.log('Successfully cleared sweeps table.');
  }
}

main().catch(console.error);
