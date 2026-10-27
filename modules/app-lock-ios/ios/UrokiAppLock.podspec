Pod::Spec.new do |s|
  s.name           = 'UrokiAppLock'
  s.version        = '1.0.0'
  s.summary        = 'Uroki: deny installing / removing apps through ManagedSettings (iOS screen time)'
  s.description    = s.summary
  s.license        = 'MIT'
  s.author         = 'Uroki'
  s.homepage       = 'https://urokiapp.kz'
  s.platforms      = { :ios => '15.1' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.swift'
end
