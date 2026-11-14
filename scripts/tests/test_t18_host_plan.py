"""Pure argv tests only; do not create users, mounts or units."""
import unittest
from deployment.staging.vnext.t17_keyfd import t18_host_plan as m


def props(argv):
    result={}
    for value in argv:
        if value.startswith('--property='):
            key,body=value[len('--property='):].split('=',1)
            if key in result:raise AssertionError('duplicate_property')
            result[key]=body
    return result


class FixedHostPlanTests(unittest.TestCase):
    def test_only_fixed_selectors_and_no_extra_arguments(self):
        for kind,mode in (('db','real'),('DB','publish'),('../DB','real'),('DB',True),(True,'real')):
            with self.assertRaises(ValueError):m.build_unit_argv(kind,mode)
        with self.assertRaises(TypeError):m.build_unit_argv('DB','real',command='forbidden')

    def test_fixed_command_modes_and_source_asset_binds(self):
        for kind in m.KINDS:
            for mode in m.MODES:
                argv=m.build_unit_argv(kind,mode)
                self.assertIs(type(argv),tuple)
                self.assertEqual(argv[0],'systemd-run')
                self.assertEqual(argv[-4:-1],('/usr/bin/python3','-I','-B'))
                self.assertEqual(argv[-5],'--')
                self.assertNotIn('/bin/sh',argv);self.assertNotIn('-c',argv)
                p=props(argv)
                self.assertIn('/run/stockinsider-t18-host-source:/readonly/t18-source',p['BindReadOnlyPaths'])
                self.assertIn('/var/tmp/stockinsider-t18-fa1d6c-assets:/run/t18-assets',p['BindReadOnlyPaths'])
                self.assertNotIn('/opt/stockinsider',p['BindReadOnlyPaths'])
                self.assertTrue(argv[-1].startswith('/readonly/t18-source/scripts/staging_t18_'))
        self.assertTrue(m.build_unit_argv('DB','admission')[-1].endswith('staging_t18_host_admission.py'))
        self.assertEqual(m.build_unit_argv('DB','invalid'),m.build_unit_argv('DB','real'))

    def test_three_uids_groups_and_raw_socket_boundary(self):
        db,app,rest=(props(m.build_unit_argv(kind,'real')) for kind in ('DB','APP','REST'))
        self.assertEqual({db['User'],app['User'],rest['User']},{'si-t18-db','si-t18-app','si-t18-rest'})
        self.assertNotIn('stockinsider-t18-dbaccess',app['SupplementaryGroups'])
        for p in (db,rest):self.assertIn('stockinsider-t18-dbaccess',p['SupplementaryGroups'])
        self.assertIn('/run/t18-pg',app['InaccessiblePaths'])
        self.assertNotIn('/run/t18-pg',rest['InaccessiblePaths'])
        self.assertEqual(db['ReadWritePaths'],'/run/t18-db-work /run/t18-pg')
        self.assertIn('/run/stockinsider-t18:/run/stockinsider-t18',db['BindReadOnlyPaths'])

    def test_fixed_network_lifetime_and_resource_bounds(self):
        for kind,memory,cpu in (('DB','768M','50%'),('APP','512M','50%'),('REST','256M','25%')):
            p=props(m.build_unit_argv(kind,'real'))
            self.assertEqual(p['MemoryMax'],memory);self.assertEqual(p['CPUQuota'],cpu)
            for key,value in (('MemorySwapMax','0'),('TasksMax','64'),('NoNewPrivileges','yes'),
                              ('CapabilityBoundingSet',''),('AmbientCapabilities',''),
                              ('PrivateNetwork','yes'),('MountFlags','private'),('ProtectSystem','strict'),
                              ('KillMode','control-group'),('TimeoutStopSec','25')):
                self.assertEqual(p[key],value)
            self.assertEqual(p['RuntimeMaxSec'],'1250' if kind=='DB' else '1100')
            self.assertEqual(p['TemporaryFileSystem'].split(),[
                '/tmp:rw,size=32M,mode=1777','/var/tmp:rw,size=32M,mode=1777'])
            if kind!='DB':
                for key in ('Requires','After','BindsTo','JoinsNamespaceOf'):self.assertEqual(p[key],m.DB_UNIT)
            for path in ('/var/lib/postgresql','/run/postgresql','/etc/stockinsider'):
                self.assertIn(path,p['InaccessiblePaths'])


if __name__=='__main__':unittest.main()
