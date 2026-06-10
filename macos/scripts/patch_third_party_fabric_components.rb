#!/usr/bin/env ruby

provider_path = File.expand_path('../build/generated/ios/RCTThirdPartyComponentsProvider.mm', __dir__)

unless File.exist?(provider_path)
  puts '[macos] RCTThirdPartyComponentsProvider.mm not found, skipping Fabric patch'
  exit 0
end

contents = File.read(provider_path)

if contents.include?('registerMacOSFabricComponent')
  puts '[macos] RCTThirdPartyComponentsProvider.mm already patched'
  exit 0
end

registrations = []
contents.scan(/@"([^"]+)":\s*NSClassFromString\(@"([^"]+)"\)/) do |component_name, class_name|
  registrations << [component_name, class_name]
end

if registrations.empty?
  warn '[macos] No Fabric component registrations found to patch'
  exit 0
end

register_calls = registrations.map do |component_name, class_name|
  "    registerMacOSFabricComponent(components, @\"#{component_name}\", @\"#{class_name}\");"
end.join("\n")

patched_block = <<~OBJC.chomp
  dispatch_once(&nativeComponentsToken, ^{
    NSMutableDictionary<NSString *, Class<RCTComponentViewProtocol>> *components =
        [NSMutableDictionary dictionary];
    void (^registerMacOSFabricComponent)(
        NSMutableDictionary<NSString *, Class<RCTComponentViewProtocol>> *,
        NSString *,
        NSString *) = ^(NSMutableDictionary<NSString *, Class<RCTComponentViewProtocol>> *dict,
                        NSString *componentName,
                        NSString *className) {
      Class componentClass = NSClassFromString(className);
      if (componentClass != nil) {
        dict[componentName] = componentClass;
      }
    };

#{register_calls}
    thirdPartyComponents = [components copy];
  });
OBJC

dispatch_once_start = contents.index('dispatch_once(&nativeComponentsToken, ^{')
unless dispatch_once_start
  warn '[macos] dispatch_once block not found in RCTThirdPartyComponentsProvider.mm'
  exit 1
end

dispatch_once_end = contents.index("\n  });", dispatch_once_start)
unless dispatch_once_end
  warn '[macos] dispatch_once block end not found in RCTThirdPartyComponentsProvider.mm'
  exit 1
end

dispatch_once_end += "\n  });".length
new_contents = contents[0...dispatch_once_start] + patched_block + contents[dispatch_once_end..]

File.write(provider_path, new_contents)
puts "[macos] Patched #{provider_path} (#{registrations.length} Fabric components, nil classes skipped at runtime)"
